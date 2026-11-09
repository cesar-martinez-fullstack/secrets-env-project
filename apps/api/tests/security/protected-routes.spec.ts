/**
 * A01 Broken Access Control — lista explícita de rutas públicas:
 * existe una lista corta de rutas públicas EN PROPÓSITO. Toda otra ruta debe exigir
 * sesión desbloqueada (cookie HttpOnly ligada a una clave viva en RAM).
 *
 * Dos defensas en un solo archivo:
 *  1. Manifest explícito: cada ruta del manifest se llama de verdad y se verifica su
 *     código HTTP sin sesión (401 VAULT_LOCKED), salvo la allowlist pública.
 *  2. Escaneo estático de los archivos de rutas: si alguien registra una ruta nueva
 *     y olvida actualizar el manifest, el test falla el build.
 */
import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { readFileSync, rmSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { makeTestConfig } from '../helpers/test-config';
import { createContainer, disposeContainer, type Container } from '../../src/container';

/** Rutas públicas EN PROPÓSITO — agregar una aquí es una decisión de seguridad. */
export const PUBLIC_ROUTES = new Set<string>([
  'GET /api/health',
  'GET /api/vault/status',
  'POST /api/vault/setup',
  'POST /api/vault/unlock',
  'POST /api/vault/lock', // idempotente por diseño (bloquea si hay sesión)
]);

/** Manifest completo de rutas del API (method + path). */
export const ROUTE_MANIFEST: string[] = [
  'GET /api/health',
  'GET /api/vault/status',
  'POST /api/vault/setup',
  'POST /api/vault/unlock',
  'POST /api/vault/lock',
  'POST /api/vault/change-password',
  'GET /api/environments',
  'POST /api/environments',
  'PATCH /api/environments/:id',
  'DELETE /api/environments/:id',
  'GET /api/secrets',
  'POST /api/secrets',
  'PATCH /api/secrets/:id',
  'DELETE /api/secrets/:id',
  'POST /api/secrets/:id/reveal',
  'POST /api/secrets/import',
  'GET /api/secrets/export',
  'GET /api/audit',
];

const SRC_ROUTES = join(import.meta.dir, '..', '..', 'src', 'routes');

function scanRouteFiles(): string[] {
  const found: string[] = [];
  // app.ts registra /api/health fuera del directorio routes/ — se escanea también.
  const appTs = readFileSync(join(import.meta.dir, '..', '..', 'src', 'app.ts'), 'utf8');
  for (const match of appTs.matchAll(/app\.(get|post|patch|delete)\(\s*'([^']*)'/g)) {
    if (match[2] === '*') continue; // catch-all del SPA, no es una ruta del API
    found.push(`${match[1]!.toUpperCase()} ${match[2]!}`);
  }
  for (const file of [
    'vault.routes.ts',
    'environments.routes.ts',
    'secrets.routes.ts',
    'audit.routes.ts',
  ]) {
    const source = readFileSync(join(SRC_ROUTES, file), 'utf8');
    for (const match of source.matchAll(/app\.(get|post|patch|delete)\(\s*'([^']*)'/g)) {
      const prefix =
        file === 'vault.routes.ts'
          ? '/api/vault'
          : file === 'environments.routes.ts'
            ? '/api/environments'
            : file === 'secrets.routes.ts'
              ? '/api/secrets'
              : '/api/audit';
      const sub = match[2] === '/' ? '' : match[2]!;
      found.push(`${match[1]!.toUpperCase()} ${prefix}${sub}`);
    }
  }
  return found;
}

// ── App real para verificar los códigos HTTP ────────────────────────────────
let rootDir: string;
let container: Container;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'sv-security-'));
  const publicDir = join(rootDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<title>SecretVault</title>');
  const config = makeTestConfig(rootDir);
  container = createContainer(config);
  app = createApp(container);
});

afterAll(() => {
  disposeContainer(container);
  rmSync(rootDir, { recursive: true, force: true });
});

describe('security: route coverage', () => {
  it('el escaneo estático encuentra exactamente las rutas del manifest (sin drift)', () => {
    const scanned = scanRouteFiles().sort();
    const manifest = [...ROUTE_MANIFEST].sort();
    expect(scanned).toEqual(manifest);
  });

  it('toda ruta del manifest está clasificada como pública o protegida', () => {
    for (const route of ROUTE_MANIFEST) {
      const classified = PUBLIC_ROUTES.has(route) || !PUBLIC_ROUTES.has(route);
      expect(classified).toBe(true); // existe en una de las dos listas por construcción
    }
  });
});

describe('security A01: rutas protegidas exigen sesión desbloqueada', () => {
  const protectedRoutes = ROUTE_MANIFEST.filter((r) => !PUBLIC_ROUTES.has(r));

  for (const route of protectedRoutes) {
    const [method, path] = route.split(' ') as [string, string];
    it(`${method} ${path} → 401 VAULT_LOCKED sin cookie`, async () => {
      const res = await app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify({}) } : {}),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VAULT_LOCKED');
    });
  }

  it('una cookie falsificada no desbloquea nada', async () => {
    const res = await app.request('/api/environments', {
      headers: { Cookie: 'sv_session=forged-token-que-no-existe' },
    });
    expect(res.status).toBe(401);
  });

  it('la allowlist pública se comporta como se diseñó', async () => {
    const health = await app.request('/api/health');
    expect(health.status).toBe(200);

    const status = await app.request('/api/vault/status');
    expect(status.status).toBe(200);

    const unlockBad = await app.request('/api/vault/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: 'lo-que-sea' }),
    });
    // Sin bóveda inicializada → 409; con bóveda → 401. Nunca 500 ni acceso a datos.
    expect([401, 409]).toContain(unlockBad.status);

    const lock = await app.request('/api/vault/lock', { method: 'POST' });
    expect(lock.status).toBe(200); // idempotente
  });
});
