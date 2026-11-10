/**
 * Test de integración del API completo: ciclo de vida de la bóveda de punta a
 * punta sobre el contenedor DI REAL (SQLite en archivo temporal + crypto real).
 * Sin red: usa app.request() de Hono.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { makeTestConfig } from '../helpers/test-config';
import { createContainer, disposeContainer, type Container } from '../../src/container';

const PASSWORD = 'IntegracionTest2024!';

let rootDir: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let sessionId: string | null = null;
let recoveryKey = '';
const RECOVERY_FORMAT = /^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/;

function cookieHeader(): Record<string, string> {
  return sessionId ? { Cookie: `sv_session=${sessionId}` } : {};
}

async function post(path: string, body: unknown, withCookie = true): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(withCookie ? cookieHeader() : {}),
    },
    body: JSON.stringify(body),
  });
}

async function get(path: string, withCookie = true): Promise<Response> {
  return app.request(path, {
    headers: { Accept: 'application/json', ...(withCookie ? cookieHeader() : {}) },
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function extractSession(res: Response): string | null {
  const match = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  return match?.[1] ?? null;
}

beforeAll(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'sv-integration-'));
  writeFileSync(join(rootDir, 'public.html'), 'x'); // placeholder
  // Fixture del SPA compilado (para el fallback)
  const publicDir = join(rootDir, 'public');
  rmSync(publicDir, { force: true });
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>SecretVault</title>');

  const config = makeTestConfig(rootDir);
  container = createContainer(config);
  app = createApp(container);
});

afterAll(() => {
  disposeContainer(container);
  rmSync(rootDir, { recursive: true, force: true });
});

describe('API integration — ciclo de vida completo', () => {
  it('GET /api/health responde ok', async () => {
    const res = await get('/api/health', false);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: 'ok', app: 'SecretVault' });
  });

  it('GET /api/vault/status reporta bóveda no inicializada', async () => {
    const res = await get('/api/vault/status', false);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ initialized: false, unlocked: false });
  });

  it('las rutas protegidas devuelven 401 VAULT_LOCKED sin sesión', async () => {
    const res = await get('/api/environments', false);
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ error: { code: 'VAULT_LOCKED' } });
  });

  it('POST /api/vault/setup crea la bóveda, el ambiente Local y la cookie de sesión', async () => {
    const res = await post('/api/vault/setup', { masterPassword: PASSWORD }, false);
    expect(res.status).toBe(201);
    const body = await json<{ ok: boolean; recoveryKey: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.recoveryKey).toMatch(RECOVERY_FORMAT); // se muestra UNA sola vez
    recoveryKey = body.recoveryKey;

    const setCookie = res.headers.get('set-cookie') ?? '';
    sessionId = extractSession(res);
    expect(sessionId).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');

    // Con la cookie de sesión la bóveda reporta desbloqueada.
    const status = await json<{ unlocked: boolean }>(await get('/api/vault/status'));
    expect(status.unlocked).toBe(true);
  });

  it('rechaza un segundo setup (ya inicializada)', async () => {
    const res = await post('/api/vault/setup', { masterPassword: 'OtraClave12345!' }, false);
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: { code: 'VAULT_ALREADY_INITIALIZED' } });
  });

  it('GET /api/projects lista el proyecto General con su ambiente Local', async () => {
    const res = await get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const projects = await json<{ id: number; name: string; environmentCount: number }[]>(res);
    expect(projects).toEqual([
      expect.objectContaining({ id: 1, name: 'General', environmentCount: 1 }),
    ]);
  });

  it('GET /api/environments lista el ambiente Local dentro del proyecto General', async () => {
    const res = await get('/api/environments');
    expect(res.status).toBe(200);
    const envs =
      await json<{ id: number; projectId: number; name: string; secretCount: number }[]>(res);
    expect(envs).toHaveLength(1);
    expect(envs[0]).toMatchObject({ projectId: 1, name: 'Local', secretCount: 0 });
  });

  it('POST /api/environments crea ambientes en un proyecto y valida duplicados dentro de él', async () => {
    const created = await json<{ id: number; projectId: number }>(
      await post('/api/environments', { projectId: 1, name: 'QA' }),
    );
    expect(created.id).toBeGreaterThan(1);
    expect(created.projectId).toBe(1);

    const dup = await post('/api/environments', { projectId: 1, name: 'qa' });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toMatchObject({ error: { code: 'ENVIRONMENT_NAME_TAKEN' } });

    const noProject = await post('/api/environments', { name: 'Sin proyecto' });
    expect(noProject.status).toBe(400);
    const ghost = await post('/api/environments', { projectId: 999, name: 'X' });
    expect(ghost.status).toBe(404);
    expect(await json(ghost)).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });
  });

  it('el mismo nombre de ambiente puede existir en dos proyectos', async () => {
    const shop = await json<{ id: number }>(await post('/api/projects', { name: 'Tienda' }));
    const shopLocal = await post('/api/environments', { projectId: shop.id, name: 'Local' });
    expect(shopLocal.status).toBe(201);
    const { id: envId } = await json<{ id: number }>(shopLocal);

    const envs = await json<{ projectId: number; name: string }[]>(await get('/api/environments'));
    expect(
      envs
        .filter((e) => e.name === 'Local')
        .map((e) => e.projectId)
        .sort(),
    ).toEqual([1, shop.id]);

    await app.request(`/api/environments/${envId}`, { method: 'DELETE', headers: cookieHeader() });
    await app.request(`/api/projects/${shop.id}`, { method: 'DELETE', headers: cookieHeader() });
  });

  it('proyectos: renombrar, nombre duplicado y no se elimina uno con ambientes', async () => {
    const created = await post('/api/projects', { name: 'Interno' });
    expect(created.status).toBe(201);
    const { id } = await json<{ id: number }>(created);

    const dup = await post('/api/projects', { name: 'INTERNO' });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toMatchObject({ error: { code: 'PROJECT_NAME_TAKEN' } });

    const renamed = await app.request(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { ...cookieHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Backoffice' }),
    });
    expect(renamed.status).toBe(200);
    expect(await json(renamed)).toMatchObject({ id, name: 'Backoffice' });

    await post('/api/environments', { projectId: id, name: 'Dev' });
    const refused = await app.request(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: cookieHeader(),
    });
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ error: { code: 'PROJECT_NOT_EMPTY' } });

    const envs = await json<{ id: number; name: string }[]>(await get('/api/environments'));
    const dev = envs.find((e) => e.name === 'Dev')!;
    await app.request(`/api/environments/${dev.id}`, { method: 'DELETE', headers: cookieHeader() });
    const ok = await app.request(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: cookieHeader(),
    });
    expect(ok.status).toBe(200);
  });

  it('proyectos: nombre vacío es inválido y un id inexistente da 404', async () => {
    expect((await post('/api/projects', { name: '   ' })).status).toBe(400);
    const missing = await app.request('/api/projects/999', {
      method: 'DELETE',
      headers: cookieHeader(),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/secrets crea y NUNCA devuelve el valor en claro', async () => {
    const res = await post('/api/secrets', {
      environmentId: 1,
      name: 'DATABASE_URL',
      value: 'postgres://admin:S3cr3t@localhost:5432/app',
      note: 'BD principal',
    });
    expect(res.status).toBe(201);
    const body = await res.text();
    expect(body).not.toContain('S3cr3t');
    expect(JSON.parse(body)).toMatchObject({
      name: 'DATABASE_URL',
      maskedValue: '••••••••',
      hasNote: true,
      environmentName: 'Local',
      projectName: 'General',
    });
  });

  it('rechaza nombres duplicados case-insensitive y valores vacíos', async () => {
    const dup = await post('/api/secrets', { environmentId: 1, name: 'database_url', value: 'x' });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toMatchObject({ error: { code: 'SECRET_NAME_TAKEN' } });

    const empty = await post('/api/secrets', { environmentId: 1, name: 'OK_NAME', value: '' });
    expect(empty.status).toBe(400);
    expect(await json(empty)).toMatchObject({ error: { code: 'SECRET_VALUE_REQUIRED' } });
  });

  it('GET /api/secrets lista enmascarado y busca globalmente entre ambientes', async () => {
    await post('/api/secrets', { environmentId: 2, name: 'QA_TOKEN', value: 'qa-secret-value' });

    const all = await json<{ name: string; maskedValue: string }[]>(await get('/api/secrets'));
    expect(all.some((s) => s.name === 'DATABASE_URL')).toBe(true);
    expect(all.every((s) => s.maskedValue === '••••••••')).toBe(true);

    const search = await json<{ name: string; environmentName: string }[]>(
      await get('/api/secrets?q=qa_tok'),
    );
    expect(search).toHaveLength(1);
    expect(search[0]).toMatchObject({ name: 'QA_TOKEN', environmentName: 'QA' });
  });

  it('POST /api/secrets/:id/reveal descifra bajo demanda y audita', async () => {
    const res = await post('/api/secrets/1/reveal', {});
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      name: 'DATABASE_URL',
      value: 'postgres://admin:S3cr3t@localhost:5432/app',
      note: 'BD principal',
    });
  });

  it('PATCH /api/secrets/:id actualiza nombre, valor y nota', async () => {
    const res = await app.request('/api/secrets/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...cookieHeader() },
      body: JSON.stringify({
        name: 'DATABASE_URL_V2',
        value: 'postgres://v2',
        note: 'actualizada',
      }),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ name: 'DATABASE_URL_V2' });

    const reveal = await json<{ value: string; note: string }>(
      await post('/api/secrets/1/reveal', {}),
    );
    expect(reveal.value).toBe('postgres://v2');
    expect(reveal.note).toBe('actualizada');
  });

  it('POST /api/secrets/import parsea el .env con conteos', async () => {
    const res = await post('/api/secrets/import', {
      environmentId: 2,
      content: 'SMTP_HOST=smtp.acme.com\nMALFORMADA\nQA_TOKEN=reemplazado\n',
      overwrite: true,
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ imported: 1, updated: 1, skipped: 0, invalidLines: 1 });
  });

  it('GET /api/secrets/export descarga en .env, CSV y PDF', async () => {
    const envRes = await get('/api/secrets/export?environmentId=1&format=env');
    expect(envRes.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(envRes.headers.get('Content-Disposition')).toContain('.env');
    const envText = await envRes.text();
    expect(envText).toContain('DATABASE_URL_V2=postgres://v2');
    expect(envText).toContain('ADVERTENCIA');

    const csvRes = await get('/api/secrets/export?environmentId=1&format=csv');
    expect(csvRes.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    const csvText = await csvRes.text();
    expect(csvText).toContain('name,value,note');

    const pdfRes = await get('/api/secrets/export?environmentId=1&format=pdf');
    expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    expect(Buffer.from(pdfBytes.slice(0, 8)).toString('latin1')).toBe('%PDF-1.4');
  });

  it('GET /api/audit registra el historial de eventos', async () => {
    const res = await get('/api/audit?limit=100');
    const { events } = await json<{ events: { type: string }[] }>(res);
    const types = events.map((e) => e.type);
    expect(types).toContain('secret.created');
    expect(types).toContain('secret.revealed');
    expect(types).toContain('secret.updated');
    expect(types).toContain('secret.imported');
    expect(types).toContain('secret.exported');
  });

  it('POST /api/vault/lock destruye la sesión (cookie limpiada) y bloquea el acceso', async () => {
    const res = await post('/api/vault/lock', {});
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('sv_session='); // deleteCookie reescribe con expiración
    sessionId = null;

    const reveal = await post('/api/secrets/1/reveal', {}, false);
    expect(reveal.status).toBe(401);
    expect(await json(reveal)).toMatchObject({ error: { code: 'VAULT_LOCKED' } });
  });

  it('POST /api/vault/unlock rechaza la contraseña incorrecta y acepta la correcta', async () => {
    const bad = await post('/api/vault/unlock', { masterPassword: 'Incorrecta99!' }, false);
    expect(bad.status).toBe(401);
    expect(await json(bad)).toMatchObject({ error: { code: 'INVALID_MASTER_PASSWORD' } });

    const good = await post('/api/vault/unlock', { masterPassword: PASSWORD }, false);
    expect(good.status).toBe(200);
    sessionId = extractSession(good);

    const reveal = await json<{ value: string }>(await post('/api/secrets/1/reveal', {}));
    expect(reveal.value).toBe('postgres://v2'); // los datos sobreviven al ciclo lock/unlock
  });

  it('POST /api/vault/change-password cambia la contraseña sin tocar los datos y la vieja deja de funcionar', async () => {
    const wrongCurrent = await post('/api/vault/change-password', {
      currentPassword: 'Incorrecta99!',
      newPassword: 'RotadaFuerte2026!',
    });
    expect(wrongCurrent.status).toBe(401);

    const ok = await post('/api/vault/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'RotadaFuerte2026!',
    });
    expect(ok.status).toBe(200);

    // La sesión activa sigue funcionando: la clave de datos no cambia, solo se re-envolvió.
    const reveal = await json<{ value: string }>(await post('/api/secrets/1/reveal', {}));
    expect(reveal.value).toBe('postgres://v2');

    // La contraseña vieja ya no desbloquea.
    const old = await post('/api/vault/unlock', { masterPassword: PASSWORD }, false);
    expect(old.status).toBe(401);

    const fresh = await post('/api/vault/unlock', { masterPassword: 'RotadaFuerte2026!' }, false);
    expect(fresh.status).toBe(200);
    sessionId = extractSession(fresh);
  });

  it('GET /api/vault/status indica que la recuperación está disponible', async () => {
    const status = await json<{ recoveryAvailable: boolean }>(await get('/api/vault/status'));
    expect(status.recoveryAvailable).toBe(true);
  });

  it('POST /api/vault/recovery-key exige la contraseña actual e invalida la clave anterior', async () => {
    const wrong = await post('/api/vault/recovery-key', { currentPassword: 'Incorrecta99!' });
    expect(wrong.status).toBe(401);

    const ok = await post('/api/vault/recovery-key', { currentPassword: 'RotadaFuerte2026!' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const body = await json<{ recoveryKey: string }>(ok);
    expect(body.recoveryKey).toMatch(RECOVERY_FORMAT);
    expect(body.recoveryKey).not.toBe(recoveryKey);

    // La clave que se mostró en el setup ya no sirve.
    const stale = await post(
      '/api/vault/recover',
      { recoveryKey, newPassword: 'NoDeberiaEntrar2026!' },
      false,
    );
    expect(stale.status).toBe(401);
    recoveryKey = body.recoveryKey;
  });

  it('POST /api/vault/recover rechaza claves inválidas sin crear sesión ni cookie', async () => {
    const wellFormedButWrong = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX';
    for (const bad of ['', 'no-es-una-clave', wellFormedButWrong]) {
      const res = await post(
        '/api/vault/recover',
        { recoveryKey: bad, newPassword: 'NoDeberiaEntrar2026!' },
        false,
      );
      expect(res.status).toBe(401);
      expect(await json(res)).toMatchObject({ error: { code: 'INVALID_RECOVERY_KEY' } });
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('POST /api/vault/recover exige una contraseña nueva fuerte y campos de texto', async () => {
    const weak = await post('/api/vault/recover', { recoveryKey, newPassword: 'corta' }, false);
    expect(weak.status).toBe(400);
    const missing = await post(
      '/api/vault/recover',
      { newPassword: 'RecuperadaSegura2026!' },
      false,
    );
    expect(missing.status).toBe(400);
  });

  it('POST /api/vault/recover devuelve el acceso, cambia la contraseña y rota la clave de recuperación', async () => {
    const res = await post(
      '/api/vault/recover',
      {
        recoveryKey: recoveryKey.toLowerCase().replaceAll('-', ' '),
        newPassword: 'RecuperadaSegura2026!',
      },
      false,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await json<{ ok: boolean; recoveryKey: string }>(res);
    expect(body.recoveryKey).toMatch(RECOVERY_FORMAT);
    expect(body.recoveryKey).not.toBe(recoveryKey);
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    const usedKey = recoveryKey;
    recoveryKey = body.recoveryKey;
    sessionId = extractSession(res);

    // Los datos siguen ahí: la clave de datos no cambió.
    const reveal = await json<{ value: string }>(await post('/api/secrets/1/reveal', {}));
    expect(reveal.value).toBe('postgres://v2');

    // La contraseña anterior ya no entra; la nueva sí; la clave usada ya no sirve.
    expect(
      (await post('/api/vault/unlock', { masterPassword: 'RotadaFuerte2026!' }, false)).status,
    ).toBe(401);
    const fresh = await post(
      '/api/vault/unlock',
      { masterPassword: 'RecuperadaSegura2026!' },
      false,
    );
    expect(fresh.status).toBe(200);
    sessionId = extractSession(fresh);
    const reused = await post(
      '/api/vault/recover',
      { recoveryKey: usedKey, newPassword: 'OtraMasSegura2026!' },
      false,
    );
    expect(reused.status).toBe(401);
  });

  it('el audit log registra la recuperación y NO contiene claves ni contraseñas', async () => {
    const audit = await json<{ events: { type: string; message: string }[] }>(
      await get('/api/audit?limit=100'),
    );
    const types = audit.events.map((e) => e.type);
    expect(types).toContain('vault.recovered');
    expect(types).toContain('vault.recovery_failed');
    expect(types).toContain('vault.recovery_key_regenerated');
    const everything = JSON.stringify(audit);
    expect(everything).not.toContain(recoveryKey);
    expect(everything).not.toContain('RecuperadaSegura2026!');
  });

  it('DELETE /api/environments/:id elimina el ambiente con sus secretos en cascada', async () => {
    const res = app.request('/api/environments/2', {
      method: 'DELETE',
      headers: cookieHeader(),
    });
    expect((await res).status).toBe(200);
    expect(await json(await get('/api/secrets?q=qa_token'))).toEqual([]);
  });

  it('DELETE /api/secrets/:id elimina secretos individualmente', async () => {
    // El ambiente QA ya fue eliminado (cascada): creamos un secreto temporal para borrarlo.
    const created = await json<{ id: number }>(
      await post('/api/secrets', { environmentId: 1, name: 'TEMPORAL_KEY', value: 'temporal' }),
    );
    const res = app.request(`/api/secrets/${created.id}`, {
      method: 'DELETE',
      headers: cookieHeader(),
    });
    expect((await res).status).toBe(200);

    const gone = await json<unknown[]>(await get('/api/secrets?q=temporal_key'));
    expect(gone).toEqual([]);
  });

  it('rutas /api/* desconocidas → 404 JSON; rutas de la SPA → index.html', async () => {
    const api404 = await get('/api/no-existe', false);
    expect(api404.status).toBe(404);
    expect(await json(api404)).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const spa = await app.request('/vault');
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('<title>SecretVault</title>');
  });

  it('las respuestas del API nunca son cacheables (Cache-Control: no-store)', async () => {
    const res = await get('/api/environments');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('SECURITY: los secretos NO existen en texto plano en el archivo de la base de datos', async () => {
    const dbPath = join(rootDir, 'data', 'secrets.db');
    const secrets = [
      'postgres://admin:S3cr3t@localhost:5432/app',
      'postgres://v2',
      'qa-secret-value',
      'smtp.acme.com',
      'reemplazado',
      'IntegracionTest2024!', // tampoco la contraseña maestra
      'RotadaFuerte2026!',
    ];
    for (const file of ['secrets.db', 'secrets.db-wal']) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(rootDir, 'data', file));
      } catch {
        continue; // WAL puede no existir tras checkpoint
      }
      const text = bytes.toString('latin1');
      for (const plaintext of secrets) {
        expect(text.includes(plaintext)).toBe(false);
      }
    }
    expect(readFileSync(dbPath).length).toBeGreaterThan(0); // la DB sí existe
  });
});
