/**
 * Las rutas que piden volver a escribir la contraseña maestra comparten un único presupuesto de
 * intentos: probar contraseñas por una u otra no debe multiplicar los intentos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const MASTER = 'ReautenticacionTest2026!';
const FAILED_ATTEMPTS_ALLOWED = 10;

let rootDir: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let headers: Record<string, string>;

const call = (path: string, body: object, method = 'POST') =>
  app.request(path, { method, headers, body: JSON.stringify(body) });

beforeAll(async () => {
  rootDir = mkdtempSync(join(tmpdir(), 'sv-reauth-'));
  const publicDir = join(rootDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>SecretVault</title>');
  container = createContainer(makeTestConfig(rootDir));
  app = createApp(container);

  const res = await app.request('/api/vault/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ masterPassword: MASTER }),
  });
  const session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  headers = { Cookie: `sv_session=${session}`, 'Content-Type': 'application/json' };
});

afterAll(() => {
  disposeContainer(container);
  rmSync(rootDir, { recursive: true, force: true });
});

describe('reauthentication attempts', () => {
  it('should count wrong passwords on the backup route against the same budget as change-password', async () => {
    const wrong = `${MASTER}-mal`;

    for (let attempt = 0; attempt < FAILED_ATTEMPTS_ALLOWED; attempt++) {
      const res = await call('/api/vault/backup', { currentPassword: wrong });
      expect(res.status).toBe(401);
    }

    const backup = await call('/api/vault/backup', { currentPassword: MASTER });
    const change = await call('/api/vault/change-password', {
      currentPassword: MASTER,
      newPassword: `${MASTER}-nueva`,
    });
    const recovery = await call('/api/vault/recovery-key', { currentPassword: MASTER });
    const retention = await call(
      '/api/audit/retention',
      { maxEvents: 500, currentPassword: MASTER },
      'PUT',
    );
    const clear = await call('/api/audit/clear', { currentPassword: MASTER });

    const statuses = [backup, change, recovery, retention, clear].map((res) => res.status);
    expect(statuses).toEqual([429, 429, 429, 429, 429]);
  });
});
