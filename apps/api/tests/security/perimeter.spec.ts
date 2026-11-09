/**
 * Perímetro de seguridad (uso personal, solo este equipo):
 * Host/Origin guards, cabeceras, configuración loopback-only, y las defensas de
 * integridad del almacenamiento (AAD por fila, rotación atómica, vida máxima de sesión).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeCryptoService } from '@secretvault/crypto';
import type { AppLike } from './helpers';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { InMemorySessionStore } from '../../src/session-store';
import { makeTestConfig } from '../helpers/test-config';

const PASSWORD = 'PerimeterSuite2026!';
const NEW_PASSWORD = 'PerimeterSuite2027!!';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

let rootDir: string;
let container: Container;
let app: AppLike;
let cookie: string;

function json(path: string, body: unknown, extra: Record<string, string> = {}) {
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...extra },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  rootDir = mkdtempSync(join(tmpdir(), 'sv-perimeter-'));
  mkdirSync(join(rootDir, 'public'), { recursive: true });
  writeFileSync(join(rootDir, 'public', 'index.html'), '<title>SecretVault</title>');
  container = createContainer(makeTestConfig(rootDir));
  app = createApp(container);

  const res = await json('/api/vault/setup', { masterPassword: PASSWORD });
  cookie = `sv_session=${/sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]}`;
});

afterAll(() => {
  disposeContainer(container);
  rmSync(rootDir, { recursive: true, force: true });
});

describe('Configuración: solo este equipo', () => {
  it('should bind to loopback by default', () => {
    expect(loadConfig({}).host).toBe('127.0.0.1');
  });

  it('should always allow loopback hosts and only add explicit extras', () => {
    expect(loadConfig({}).allowedHosts).toEqual(['localhost', '127.0.0.1', '[::1]']);
    expect(loadConfig({ SV_ALLOWED_HOSTS: 'Vault.local, ' }).allowedHosts).toContain('vault.local');
  });
});

describe('Host guard (anti DNS-rebinding)', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('should accept Host %s', async (host) => {
    const res = await app.request(`http://${host}:3000/api/health`);
    expect(res.status).toBe(200);
  });

  it.each(['evil.com', '192.168.1.50', 'localhost.evil.com', '0.0.0.0'])(
    'should reject Host %s with 403 and no data',
    async (host) => {
      const res = await app.request(`http://${host}:3000/api/health`);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('HOST_NOT_ALLOWED');
    },
  );

  it('should also protect the SPA, not only /api', async () => {
    const res = await app.request('http://evil.com/');
    expect(res.status).toBe(403);
  });
});

describe('Origin guard (anti CSRF)', () => {
  it('should block a mutating request coming from another origin', async () => {
    const res = await json('/api/vault/lock', {}, { Origin: 'http://evil.com', Cookie: cookie });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CROSS_ORIGIN_BLOCKED');
  });

  it('should block cross-site fetches via Sec-Fetch-Site', async () => {
    const res = await json('/api/vault/lock', {}, { 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
  });

  it('should allow same-origin mutations and Origin-less clients (curl, tests)', async () => {
    const same = await json('/api/vault/lock', {}, { Origin: 'http://localhost' });
    expect(same.status).toBe(200);
    const none = await json('/api/vault/lock', {});
    expect(none.status).toBe(200);
  });

  it('should not restrict safe (read-only) methods', async () => {
    const res = await app.request('http://localhost/api/health', {
      headers: { Origin: 'http://evil.com' },
    });
    expect(res.status).toBe(200);
  });
});

describe('Cabeceras de seguridad', () => {
  it('should send a strict CSP without inline scripts and deny framing', async () => {
    const res = await app.request('http://localhost/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('should apply the headers to API responses too', async () => {
    const res = await app.request('http://localhost/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('Integridad del almacenamiento', () => {
  it('should detect ciphertext swapped between two secrets (AAD bound to the row)', async () => {
    await container.vaultService.unlock(PASSWORD);
    const res = await json('/api/vault/unlock', { masterPassword: PASSWORD });
    const session = `sv_session=${/sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]}`;
    const create = (name: string, value: string) =>
      app.request('http://localhost/api/secrets', {
        method: 'POST',
        headers: { ...JSON_HEADERS, Cookie: session },
        body: JSON.stringify({ environmentId: 1, name, value }),
      });
    const prod = (await (await create('PROD_DB', 'valor-prod')).json()) as { id: number };
    const dev = (await (await create('DEV_DB', 'valor-dev')).json()) as { id: number };

    // Atacante con acceso de escritura al disco: copia el blob de DEV sobre PROD.
    container.db
      .query(
        'UPDATE secrets SET value_enc = (SELECT value_enc FROM secrets WHERE id = ?) WHERE id = ?',
      )
      .run(dev.id, prod.id);

    const reveal = await app.request(`http://localhost/api/secrets/${prod.id}/reveal`, {
      method: 'POST',
      headers: { Cookie: session },
    });
    expect(reveal.status).not.toBe(200);
    expect(await reveal.text()).not.toContain('valor-dev');

    // Limpieza: la fila manipulada bloquearía (correctamente) la rotación de otros tests.
    container.db.query('DELETE FROM secrets WHERE id = ?').run(prod.id);
  });

  it('should keep every secret readable after renaming it (re-encrypted under the new name)', async () => {
    const res = await json('/api/vault/unlock', { masterPassword: PASSWORD });
    const session = `sv_session=${/sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]}`;
    const created = (await (
      await app.request('http://localhost/api/secrets', {
        method: 'POST',
        headers: { ...JSON_HEADERS, Cookie: session },
        body: JSON.stringify({ environmentId: 1, name: 'OLD_NAME', value: 'v1', note: 'nota' }),
      })
    ).json()) as { id: number };

    const patch = await app.request(`http://localhost/api/secrets/${created.id}`, {
      method: 'PATCH',
      headers: { ...JSON_HEADERS, Cookie: session },
      body: JSON.stringify({ name: 'NEW_NAME' }),
    });
    expect(patch.status).toBe(200);

    const reveal = await app.request(`http://localhost/api/secrets/${created.id}/reveal`, {
      method: 'POST',
      headers: { Cookie: session },
    });
    const body = (await reveal.json()) as { value: string; note: string };
    expect(body.value).toBe('v1');
    expect(body.note).toBe('nota');
  });

  it('should roll back a failed password rotation completely (atomicity)', async () => {
    const res = await json('/api/vault/unlock', { masterPassword: PASSWORD });
    const session = `sv_session=${/sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]}`;

    // Simula un crash a mitad de la rotación: el UPDATE del verificador explota.
    container.db.exec(
      "CREATE TRIGGER boom BEFORE UPDATE ON vault_meta BEGIN SELECT RAISE(ABORT, 'crash simulado'); END;",
    );
    const failed = await app.request('http://localhost/api/vault/change-password', {
      method: 'POST',
      headers: { ...JSON_HEADERS, Cookie: session },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    });
    container.db.exec('DROP TRIGGER boom');
    expect(failed.status).toBe(500);

    // La contraseña vieja sigue valiendo y TODOS los secretos se descifran igual.
    const again = await json('/api/vault/unlock', { masterPassword: PASSWORD });
    expect(again.status).toBe(200);
    const secrets = (await (
      await app.request('http://localhost/api/secrets', {
        headers: {
          Cookie: `sv_session=${/sv_session=([^;]+)/.exec(again.headers.get('set-cookie') ?? '')![1]}`,
        },
      })
    ).json()) as { id: number }[];
    expect(secrets.length).toBeGreaterThan(0);
  });
});

describe('Sesiones', () => {
  const crypto = new NodeCryptoService();

  it('should cap the session lifetime even with constant activity (absolute expiry)', async () => {
    let now = 1_000_000;
    const store = new InMemorySessionStore(crypto, 60, () => now);
    const session = await store.create(new Uint8Array(32).fill(1), 15);

    now += 14 * 60_000;
    await store.touch(session.sessionId, 15); // actividad: ventana deslizante
    now += 14 * 60_000;
    await store.touch(session.sessionId, 15);
    now += 14 * 60_000;
    await store.touch(session.sessionId, 15);
    now += 14 * 60_000; // t = 56 min: aún viva
    expect(await store.get(session.sessionId)).not.toBeNull();
    const touched = await store.touch(session.sessionId, 15);
    expect(touched!.expiresAt.getTime()).toBe(session.createdAt.getTime() + 60 * 60_000);

    now += 5 * 60_000; // t = 61 min: el tope absoluto la mata pese a la actividad
    expect(await store.get(session.sessionId)).toBeNull();
  });

  it('should destroy every session key on clear() (process shutdown)', async () => {
    const store = new InMemorySessionStore(crypto);
    const key = new Uint8Array(32).fill(9);
    await store.create(key, 15);
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(key.every((b) => b === 0)).toBe(true);
  });
});
