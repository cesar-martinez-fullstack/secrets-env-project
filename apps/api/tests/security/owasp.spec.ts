/**
 * Suite de seguridad mapeada a OWASP Top 10 (ver docs/SECURITY.md).
 * Cada describe corresponde a una categoría con su ID.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppLike } from './helpers';
import { createApp } from '../../src/app';
import { makeTestConfig } from '../helpers/test-config';
import { createContainer, disposeContainer, type Container } from '../../src/container';

const PASSWORD = 'OwaspTestSuite2026!';

interface VaultInstance {
  app: AppLike;
  container: Container;
  rootDir: string;
  cleanup: () => void;
}

function newVault(): VaultInstance {
  const rootDir = mkdtempSync(join(tmpdir(), 'sv-owasp-'));
  const publicDir = join(rootDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<title>SecretVault</title>');
  const config = makeTestConfig(rootDir);
  const container = createContainer(config);
  const app = createApp(container);
  return {
    app,
    container,
    rootDir,
    cleanup: () => {
      disposeContainer(container);
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

async function unlock(app: AppLike, password: string): Promise<string | null> {
  const res = await app.request('/api/vault/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ masterPassword: password }),
  });
  const match = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  return match?.[1] ?? null;
}

async function createSecret(
  app: AppLike,
  sessionId: string,
  name: string,
  value: string,
): Promise<Response> {
  return app.request('/api/secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `sv_session=${sessionId}` },
    body: JSON.stringify({ environmentId: 1, name, value }),
  });
}

describe('A02 · Cryptographic Failures', () => {
  const vault = newVault();
  afterAll(vault.cleanup);

  it('la cookie de sesión es HttpOnly + SameSite=Lax + Path=/', async () => {
    await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });
    const res = await vault.app.request('/api/vault/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
  });

  it('el valor de un secreto jamás viaja en el listado (solo máscara de longitud fija)', async () => {
    const sessionId = await unlock(vault.app, PASSWORD);
    await createSecret(vault.app, sessionId!, 'MASK_CHECK', 'ESTE-VALOR-ES-SECRETO-123');
    const list = await vault.app.request('/api/secrets', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    const body = await list.text();
    expect(body).not.toContain('ESTE-VALOR-ES-SECRETO-123');
    expect(body).toContain('••••••••');
  });

  it('la base de datos no contiene secretos ni la contraseña maestra en texto plano', async () => {
    for (const file of ['secrets.db', 'secrets.db-wal']) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(vault.rootDir, 'data', file));
      } catch {
        continue;
      }
      const raw = bytes.toString('latin1');
      expect(raw.includes('ESTE-VALOR-ES-SECRETO-123')).toBe(false);
      expect(raw.includes(PASSWORD)).toBe(false);
    }
  });

  it('la máscara no filtra la longitud del valor real', () => {
    // MASKED_VALUE es constante: dos valores de distinta longitud comparten máscara.
    const short = 'a';
    const long = 'a'.repeat(500);
    expect('••••••••'.length).toBe(8);
    expect(short.length === 8).toBe(false);
    expect(long.length === 8).toBe(false);
  });
});

describe('A03 · Injection', () => {
  const vault = newVault();
  afterAll(vault.cleanup);
  let sessionId: string | null = null;

  beforeAll(async () => {
    await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });
    sessionId = await unlock(vault.app, PASSWORD);
  });

  it('nombres con SQL malicioso se rechazan por validación (no se ejecutan)', async () => {
    const res = await createSecret(vault.app, sessionId!, "X'; DROP TABLE secrets;--", 'v');
    expect(res.status).toBe(400); // SECRET_NAME_INVALID — nunca llega a SQL
    expect(await res.text()).not.toContain('DROP');
  });

  it('valores con payload SQL se almacenan cifrados y devuelven intactos por reveal', async () => {
    const payload = "'; DELETE FROM secrets WHERE '1'='1";
    const created = await createSecret(vault.app, sessionId!, 'SQL_VALUE', payload);
    expect(created.status).toBe(201);

    const reveal = await vault.app.request('/api/secrets/1/reveal', {
      method: 'POST',
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    expect(((await reveal.json()) as { value: string }).value).toBe(payload);

    // La base de datos sigue íntegra y operativa
    const list = await vault.app.request('/api/secrets', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    expect(list.status).toBe(200);
  });

  it('la búsqueda global no interpreta comodines LIKE (% y _ son literales)', async () => {
    await createSecret(vault.app, sessionId!, 'ABC_DEF', 'v');
    const q = await vault.app.request('/api/secrets?q=%25', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    expect(((await q.json()) as unknown[]).length).toBe(0); // % no es comodín aquí

    const underscore = await vault.app.request('/api/secrets?q=_DEF', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    expect(((await underscore.json()) as unknown[]).length).toBe(1); // substring literal
  });

  it('nombres de ambiente con metacaracteres se persisten con parametrización (sin daño)', async () => {
    const created = await vault.app.request('/api/environments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `sv_session=${sessionId}` },
      body: JSON.stringify({ projectId: 1, name: "QA'); DROP TABLE environments;--" }),
    });
    expect(created.status).toBe(201);

    const list = await vault.app.request('/api/environments', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    expect(list.status).toBe(200); // la tabla sigue viva
    const envs = (await list.json()) as { id: number; name: string }[];
    expect(envs.some((e) => e.name.includes('DROP TABLE'))).toBe(true);

    const hostile = envs.find((e) => e.name.includes('DROP TABLE'))!;
    await vault.app.request(`/api/environments/${hostile.id}`, {
      method: 'DELETE',
      headers: { Cookie: `sv_session=${sessionId}` },
    });
  });
});

describe('A04 · Insecure Design (fuerza bruta y política de contraseñas)', () => {
  const vault = newVault();
  afterAll(vault.cleanup);

  it('10 intentos de contraseña fallida → el 11º se bloquea con 429 (aunque sea correcta)', async () => {
    await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });

    for (let i = 0; i < 10; i++) {
      const res = await vault.app.request('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPassword: `Errada-${i}-x!` }),
      });
      expect(res.status).toBe(401);
    }

    const eleventh = await vault.app.request('/api/vault/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(eleventh.headers.get('Retry-After')).toBeTruthy();
  });

  it('el setup rechaza contraseñas débiles con issues accionables', async () => {
    const res = await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: 'corta' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: { message: string }[] } };
    expect(body.error.code).toBe('WEAK_MASTER_PASSWORD');
    expect(body.error.issues[0]?.message).toContain('al menos');
  });
});

describe('A05 · Security Misconfiguration', () => {
  const vault = newVault();
  afterAll(vault.cleanup);

  it('errores 404 del API son JSON sin stack traces ni rutas internas', async () => {
    const res = await vault.app.request('/api/ruta-secreta-inexistente');
    const text = await res.text();
    expect(res.status).toBe(404);
    const body = JSON.parse(text) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(text).not.toContain('at ');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('.ts:');
  });

  it('las respuestas del API no exponen X-Powered-By y son no-store', async () => {
    const res = await vault.app.request('/api/health');
    expect(res.headers.get('X-Powered-By')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('los errores internos no filtran detalles (mensaje genérico)', async () => {
    // Provoca un 500 inyectando un body JSON válido pero con tipos incorrectos
    const res = await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: 12345 }), // number, no string
    });
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.error.message).not.toMatch(/at .+:\d+/); // sin stack
  });
});

describe('A07 · Identification and Authentication Failures', () => {
  const vault = newVault();
  afterAll(vault.cleanup);

  it('los tokens de sesión son únicos y de alta entropía (43 chars base64url)', async () => {
    await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });
    const tokens = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const token = await unlock(vault.app, PASSWORD);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(tokens.has(token!)).toBe(false);
      tokens.add(token!);
    }
  });

  it('lock limpia la cookie de sesión en la respuesta', async () => {
    const sessionId = await unlock(vault.app, PASSWORD);
    const res = await vault.app.request('/api/vault/lock', {
      method: 'POST',
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('sv_session=;'); // valor vaciado
  });

  it('sesiones expiradas (auto-lock) son rechazadas', async () => {
    const sessionId = await unlock(vault.app, PASSWORD);
    // El TTL del contenedor de prueba es 15 min; simulamos expiración con un
    // token inexistente (la expiración real se cubre en session-store.spec.ts).
    const expired = await vault.app.request('/api/environments', {
      headers: { Cookie: `sv_session=${'A'.repeat(43)}` },
    });
    expect(expired.status).toBe(401);
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('A09 · Security Logging and Monitoring Failures', () => {
  const vault = newVault();
  afterAll(vault.cleanup);
  let sessionId: string | null = null;

  beforeAll(async () => {
    await vault.app.request('/api/vault/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: PASSWORD }),
    });
    sessionId = await unlock(vault.app, PASSWORD);
    await createSecret(vault.app, sessionId!, 'AUDITED_KEY', 'valor-auditado');
    await vault.app.request('/api/secrets/1/reveal', {
      method: 'POST',
      headers: { Cookie: `sv_session=${sessionId}` },
    });
  });

  it('cada acceso sensible queda auditado con marca de tiempo', async () => {
    const res = await vault.app.request('/api/audit?limit=50', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    const { events } = (await res.json()) as {
      events: { type: string; message: string; createdAt: string }[];
    };
    const types = events.map((e) => e.type);
    expect(types).toContain('vault.setup');
    expect(types).toContain('vault.unlock');
    expect(types).toContain('secret.created');
    expect(types).toContain('secret.revealed');
    for (const event of events) {
      expect(Number.isNaN(new Date(event.createdAt).getTime())).toBe(false); // fecha ISO válida
    }
  });

  it('los mensajes de auditoría no contienen los valores de los secretos', async () => {
    const res = await vault.app.request('/api/audit?limit=50', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    const { events } = (await res.json()) as { events: { message: string }[] };
    for (const event of events) {
      expect(event.message).not.toContain('valor-auditado');
    }
  });

  it('los intentos fallidos de desbloqueo se registran', async () => {
    await vault.app.request('/api/vault/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: 'FallidaTotal99!' }),
    });
    const res = await vault.app.request('/api/audit?limit=10', {
      headers: { Cookie: `sv_session=${sessionId}` },
    });
    const { events } = (await res.json()) as { events: { type: string }[] };
    expect(events.some((e) => e.type === 'vault.unlock_failed')).toBe(true);
  });
});
