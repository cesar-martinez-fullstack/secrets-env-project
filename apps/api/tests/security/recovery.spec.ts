/**
 * Clave de recuperación — pruebas de seguridad e integración con cripto y SQLite REALES:
 * - la clave nunca llega al disco;
 * - fuerza bruta sobre /recover limitada por rate limit;
 * - actualización transparente de una bóveda de formato 1 (sin clave de recuperación);
 * - los secretos sobreviven a cada camino (cambio de contraseña, recuperación, regeneración).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AAD_VERIFIER, VERIFIER_PLAINTEXT, secretValueAad } from '@secretvault/core';
import { NodeCryptoService } from '@secretvault/crypto';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const FORMAT = /^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/;
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const PASSWORD = 'RecoverySuite2026!';

interface Instance {
  app: ReturnType<typeof createApp>;
  container: Container;
  rootDir: string;
  cleanup: () => void;
}

function newInstance(): Instance {
  const rootDir = mkdtempSync(join(tmpdir(), 'sv-recovery-'));
  mkdirSync(join(rootDir, 'public'), { recursive: true });
  writeFileSync(join(rootDir, 'public', 'index.html'), '<title>SecretVault</title>');
  const container = createContainer(makeTestConfig(rootDir));
  return {
    app: createApp(container),
    container,
    rootDir,
    cleanup: () => {
      disposeContainer(container);
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

const call = async (
  inst: Instance,
  path: string,
  body?: unknown,
  cookie?: string,
  method = 'POST',
): Promise<Response> =>
  inst.app.request(`http://localhost${path}`, {
    method,
    headers: { ...JSON_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cookieOf = (res: Response): string =>
  `sv_session=${/sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]}`;

async function reveal(inst: Instance, cookie: string, id: number): Promise<string> {
  const res = await call(inst, `/api/secrets/${id}/reveal`, {}, cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { value: string }).value;
}

describe('la clave de recuperación nunca toca el disco', () => {
  const inst = newInstance();
  afterAll(inst.cleanup);

  it('should not appear, nor the password, in the database or its WAL', async () => {
    const setup = await call(inst, '/api/vault/setup', { masterPassword: PASSWORD });
    const { recoveryKey } = (await setup.json()) as { recoveryKey: string };
    expect(recoveryKey).toMatch(FORMAT);
    await call(
      inst,
      '/api/secrets',
      { environmentId: 1, name: 'TOKEN', value: 'valor-top-secret' },
      cookieOf(setup),
    );

    for (const file of ['secrets.db', 'secrets.db-wal']) {
      let raw: string;
      try {
        raw = readFileSync(join(inst.rootDir, 'data', file)).toString('latin1');
      } catch {
        continue;
      }
      expect(raw.includes(recoveryKey)).toBe(false);
      expect(raw.includes(recoveryKey.replaceAll('-', ''))).toBe(false);
      expect(raw.includes(PASSWORD)).toBe(false);
      expect(raw.includes('valor-top-secret')).toBe(false);
    }
  });
});

describe('rate limit de /recover (fuerza bruta de la clave)', () => {
  const inst = newInstance();
  beforeAll(async () => {
    await call(inst, '/api/vault/setup', { masterPassword: PASSWORD });
  });
  afterAll(inst.cleanup);

  it('should return 429 with Retry-After after 10 failed attempts', async () => {
    const wrong = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX';
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await call(inst, '/api/vault/recover', {
        recoveryKey: wrong,
        newPassword: 'NuevaClaveSegura2026!',
      });
      statuses.push(res.status);
      if (res.status === 429) expect(res.headers.get('retry-after')).toBeTruthy();
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });

  it('should audit every failed attempt', async () => {
    const failed = inst.container.db
      .query("SELECT COUNT(*) AS n FROM audit_log WHERE type = 'vault.recovery_failed'")
      .get() as { n: number };
    expect(failed.n).toBe(10);
  });
});

describe('actualización de una bóveda de formato 1', () => {
  const inst = newInstance();
  const crypto = new NodeCryptoService();
  let oldKey: Uint8Array;
  afterAll(inst.cleanup);

  beforeAll(async () => {
    // Reconstruye lo que escribía la versión anterior: la clave derivada cifra los secretos directamente.
    const { db } = inst.container;
    const salt = crypto.generateSalt();
    oldKey = await crypto.deriveKey(PASSWORD, salt, 100_000);
    const verifier = await crypto.encrypt(oldKey, VERIFIER_PLAINTEXT, AAD_VERIFIER);
    const now = new Date().toISOString();
    db.query(
      `INSERT INTO vault_meta (id, salt, iterations, verifier, created_at, updated_at)
       VALUES (1, ?, 100000, ?, ?, ?)`,
    ).run(salt, verifier, now, now);
    db.query("INSERT INTO environments (name, created_at, updated_at) VALUES ('Local', ?, ?)").run(
      now,
      now,
    );
    const valueEnc = await crypto.encrypt(
      oldKey,
      'valor-heredado',
      secretValueAad(1, 'LEGACY_TOKEN'),
    );
    db.query(
      `INSERT INTO secrets (environment_id, name, value_enc, created_at, updated_at)
       VALUES (1, 'LEGACY_TOKEN', ?, ?, ?)`,
    ).run(valueEnc, now, now);
  });

  it('should report the vault as initialized but without recovery yet', async () => {
    const status = (await (
      await call(inst, '/api/vault/status', undefined, undefined, 'GET')
    ).json()) as {
      initialized: boolean;
      recoveryAvailable: boolean;
    };
    expect(status).toMatchObject({ initialized: true, recoveryAvailable: false });
  });

  it('should refuse /recover until the vault is upgraded', async () => {
    const res = await call(inst, '/api/vault/recover', {
      recoveryKey: 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX',
      newPassword: 'NuevaClaveSegura2026!',
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'RECOVERY_NOT_AVAILABLE' } });
  });

  let recoveryKey = '';
  it('should upgrade on the first unlock: hand over a recovery key and keep the secrets readable', async () => {
    const res = await call(inst, '/api/vault/unlock', { masterPassword: PASSWORD });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; recoveryKey?: string };
    expect(body.recoveryKey).toMatch(FORMAT);
    recoveryKey = body.recoveryKey!;

    // Sin re-cifrar: la clave antigua pasó a ser la clave de datos.
    expect(await reveal(inst, cookieOf(res), 1)).toBe('valor-heredado');
    const row = inst.container.db.query('SELECT format_version FROM vault_meta').get() as {
      format_version: number;
    };
    expect(row.format_version).toBe(2);
  });

  it('should not show a recovery key again on later unlocks', async () => {
    const res = await call(inst, '/api/vault/unlock', { masterPassword: PASSWORD });
    expect(await res.json()).toEqual({ ok: true });
  });

  it('should let the new recovery key restore access to the inherited secret', async () => {
    const res = await call(inst, '/api/vault/recover', {
      recoveryKey,
      newPassword: 'ContraseñaNuevaSegura#2026',
    });
    expect(res.status).toBe(200);
    expect(await reveal(inst, cookieOf(res), 1)).toBe('valor-heredado');
  });
});

describe('cambio de contraseña con sesión larga', () => {
  const inst = newInstance();
  afterAll(inst.cleanup);

  it('should leave existing ciphertexts byte-for-byte untouched (no re-encryption needed)', async () => {
    const setup = await call(inst, '/api/vault/setup', { masterPassword: PASSWORD });
    const cookie = cookieOf(setup);
    await call(
      inst,
      '/api/secrets',
      { environmentId: 1, name: 'API_KEY', value: 'abc123' },
      cookie,
    );
    const before = inst.container.db.query('SELECT value_enc FROM secrets').get() as {
      value_enc: Uint8Array;
    };

    const change = await call(
      inst,
      '/api/vault/change-password',
      { currentPassword: PASSWORD, newPassword: 'SegundaClaveSegura2027!' },
      cookie,
    );
    expect(change.status).toBe(200);

    const after = inst.container.db.query('SELECT value_enc FROM secrets').get() as {
      value_enc: Uint8Array;
    };
    expect(Buffer.from(after.value_enc).equals(Buffer.from(before.value_enc))).toBe(true);
    expect(await reveal(inst, cookie, 1)).toBe('abc123');
  });
});
