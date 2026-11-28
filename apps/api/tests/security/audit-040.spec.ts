import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeCryptoService } from '@secretvault/crypto';
import { VaultLockedError } from '@secretvault/core';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { describeError } from '../../src/logging/request-log';
import { makeTestConfig } from '../helpers/test-config';

const current = randomUUID();
let root: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let session = '';

const headers = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  Cookie: `sv_session=${session}`,
  ...extra,
});

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: headers(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function open(): Promise<void> {
  const res = await request('POST', '/api/vault/unlock', { masterPassword: current });
  session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
}

const auditTypes = async () =>
  (
    (await (await request('GET', '/api/audit?limit=500')).json()) as { events: { type: string }[] }
  ).events.map((event) => event.type);

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-audit040-'));
  container = createContainer(makeTestConfig(root));
  app = createApp(container);
  const res = await request('POST', '/api/vault/setup', { masterPassword: current });
  session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
});

afterAll(() => {
  disposeContainer(container);
  rmSync(root, { recursive: true, force: true });
});

describe('M-1: the record of a cleared history cannot be flushed by other changes', () => {
  const settings = (autoLockMinutes: number) => ({
    currentPassword: current,
    autoLockMinutes,
    sessionMaxMinutes: 720,
    clipboardClearSeconds: 30,
  });

  it('should survive more than a hundred settings and retention changes', async () => {
    await request('POST', '/api/audit/clear', { currentPassword: current });

    for (let i = 0; i < 60; i++) {
      await request('PUT', '/api/security-settings', settings(i % 2 === 0 ? 30 : 60));
      await request('PUT', '/api/security-settings/log-level', {
        currentPassword: current,
        level: i % 2 === 0 ? 'warn' : 'error',
      });
      await request('PUT', '/api/audit/retention', {
        currentPassword: current,
        maxEvents: i % 2 === 0 ? 500 : 1000,
      });
    }

    expect(await auditTypes()).toContain('audit.cleared');
  }, 120_000);

  it('should not record a change when nothing changes', async () => {
    const before = (await auditTypes()).length;
    const same = (await (await request('GET', '/api/security-settings')).json()) as {
      autoLockMinutes: number;
    };
    const level = (await (await request('GET', '/api/security-settings/log-level')).json()) as {
      level: string;
    };
    const retention = (await (await request('GET', '/api/audit/retention')).json()) as {
      maxEvents: number;
    };

    await request('PUT', '/api/security-settings', settings(same.autoLockMinutes));
    await request('PUT', '/api/security-settings/log-level', {
      currentPassword: current,
      level: level.level,
    });
    await request('PUT', '/api/audit/retention', {
      currentPassword: current,
      maxEvents: retention.maxEvents,
    });

    expect((await auditTypes()).length).toBe(before);
  });
});

describe('M-2: the plaintext export cannot be triggered from another site', () => {
  it.each(['cross-site', 'same-site'])('should refuse a %s navigation', async (site) => {
    const res = await app.request('/api/secrets/export?environmentId=1&format=env', {
      headers: headers({ 'Sec-Fetch-Site': site }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('content-disposition')).toBeNull();
  });

  it.each(['same-origin', 'none'])('should allow a %s request', async (site) => {
    const res = await app.request('/api/secrets/export?environmentId=1&format=env', {
      headers: headers({ 'Sec-Fetch-Site': site }),
    });
    expect(res.status).toBe(200);
  });
});

describe('B-1: nothing is ever encrypted with a wiped key', () => {
  const crypto = new NodeCryptoService();

  it('should refuse to encrypt or wrap with an all-zero key', async () => {
    const wiped = new Uint8Array(32);
    const valid = crypto.generateKey();

    await expect(crypto.encrypt(wiped, 'dato', 'aad')).rejects.toThrow(VaultLockedError);
    await expect(crypto.wrapKey(valid, wiped, 'aad')).rejects.toThrow(VaultLockedError);
    await expect(crypto.wrapKey(wiped, valid, 'aad')).rejects.toThrow(VaultLockedError);
  });

  it('should write nothing when the vault locks while the request body is arriving', async () => {
    await open();
    const payload = JSON.stringify({ environmentId: 1, name: 'TARDIA', value: 'dato' });
    let release: () => void = () => undefined;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        await new Promise<void>((resolve) => (release = resolve));
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    const pending = app.request('/api/secrets', {
      method: 'POST',
      headers: headers(),
      body,
      duplex: 'half',
    } as RequestInit);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await container.sessionStore.clear();
    release();

    expect((await pending).status).toBe(401);
    await open();
    expect(await (await request('GET', '/api/secrets?q=TARDIA')).json()).toEqual([]);
  });
});

describe('B-1: an interrupted overwrite', () => {
  it('should keep the previous value when the vault locks during an import', async () => {
    await open();
    const created = (await (
      await request('POST', '/api/secrets', { environmentId: 1, name: 'PREVIA', value: 'original' })
    ).json()) as { id: number };
    const payload = JSON.stringify({
      environmentId: 1,
      overwrite: true,
      entries: [{ name: 'PREVIA', value: 'reemplazo' }],
    });
    let release: () => void = () => undefined;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        await new Promise<void>((resolve) => (release = resolve));
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    const pending = app.request('/api/secrets/import', {
      method: 'POST',
      headers: headers(),
      body,
      duplex: 'half',
    } as RequestInit);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await container.sessionStore.clear();
    release();

    expect((await pending).status).toBe(401);
    await open();
    const revealed = await request('POST', `/api/secrets/${created.id}/reveal`);
    expect(await revealed.json()).toMatchObject({ value: 'original' });
  });
});

describe('informative findings', () => {
  it('should keep inherited limits unsaved when only the clipboard changes', async () => {
    const db = container.db;
    db.query(
      'UPDATE security_settings SET auto_lock_minutes = NULL, session_max_minutes = NULL',
    ).run();
    await open();

    await request('PUT', '/api/security-settings', {
      currentPassword: current,
      autoLockMinutes: 15,
      sessionMaxMinutes: 720,
      clipboardClearSeconds: 60,
    });

    expect(
      db.query('SELECT auto_lock_minutes, session_max_minutes FROM security_settings').get(),
    ).toEqual({ auto_lock_minutes: null, session_max_minutes: null });
  });

  it('should not let an error message pose as a stack line', () => {
    const error = new Error('fallo\nat dato-que-venia-en-la-peticion');

    expect(String(describeError(error).stack)).not.toContain('dato-que-venia');
  });
});
