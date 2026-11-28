import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const current = randomUUID();
let root: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let session = '';

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: `sv_session=${session}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const sessionFrom = (res: Response): string =>
  /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';

const maxAge = (res: Response): number =>
  Number(/Max-Age=(\d+)/i.exec(res.headers.get('set-cookie') ?? '')?.[1]);

function boot(): void {
  container = createContainer(makeTestConfig(root, { autoLockMinutes: 20 }));
  app = createApp(container);
}

const change = (overrides: Record<string, unknown> = {}) => ({
  currentPassword: current,
  autoLockMinutes: 60,
  sessionMaxMinutes: 240,
  clipboardClearSeconds: 60,
  ...overrides,
});

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-security-'));
  boot();
  session = sessionFrom(await request('POST', '/api/vault/setup', { masterPassword: current }));
});

afterAll(() => {
  disposeContainer(container);
  rmSync(root, { recursive: true, force: true });
});

describe('/api/security-settings', () => {
  it('should start from the configured values with cleaning after 30 seconds', async () => {
    const res = await request('GET', '/api/security-settings');
    expect(await res.json()).toMatchObject({
      autoLockMinutes: 20,
      sessionMaxMinutes: 720,
      clipboardClearSeconds: 30,
      options: {
        autoLockMinutes: [5, 15, 30, 60],
        sessionMaxMinutes: [60, 240, 480, 720],
        clipboardClearSeconds: [0, 30, 60],
      },
    });
    expect(maxAge(res)).toBeGreaterThan(19 * 60);
    expect(maxAge(res)).toBeLessThanOrEqual(20 * 60);
  });

  it('should refuse a wrong password and a value outside the options', async () => {
    const wrong = await request('PUT', '/api/security-settings', change({ currentPassword: 'x' }));
    const invalid = await request(
      'PUT',
      '/api/security-settings',
      change({ sessionMaxMinutes: 10_080 }),
    );

    expect(wrong.status).toBe(401);
    expect(invalid.status).toBe(400);
    const after = await (await request('GET', '/api/security-settings')).json();
    expect(after).toMatchObject({ autoLockMinutes: 20, clipboardClearSeconds: 30 });
  });

  it('should apply new limits to the cookie, the status and the audit', async () => {
    expect((await request('PUT', '/api/security-settings', change())).status).toBe(200);

    const next = await request('GET', '/api/security-settings');
    expect(maxAge(next)).toBeGreaterThan(59 * 60);
    const status = await (await request('GET', '/api/vault/status')).json();
    expect(status).toMatchObject({ autoLockMinutes: 60 });
    const audit = await (await request('GET', '/api/audit')).text();
    expect(audit).toContain('security.settings_changed');
    expect(audit).not.toContain(current);
  });

  it('should shorten sessions that are already open', async () => {
    const [id] = [session];
    const before = (await container.sessionStore.get(id))!.expiresAt.getTime();

    await request('PUT', '/api/security-settings', change({ autoLockMinutes: 5 }));

    const after = (await container.sessionStore.get(id))!.expiresAt.getTime();
    expect(before - after).toBeGreaterThan(50 * 60_000);
  });

  it('should keep the saved values after a restart', async () => {
    disposeContainer(container);
    boot();
    session = '';
    session = sessionFrom(await request('POST', '/api/vault/unlock', { masterPassword: current }));

    const loaded = await (await request('GET', '/api/security-settings')).json();

    expect(loaded).toMatchObject({
      autoLockMinutes: 5,
      sessionMaxMinutes: 240,
      clipboardClearSeconds: 60,
    });
  });

  it('should require an open session', async () => {
    const open = session;
    session = '';
    expect((await request('GET', '/api/security-settings')).status).toBe(401);
    expect((await request('PUT', '/api/security-settings', change())).status).toBe(401);
    session = open;
  });

  it('should share the re-authentication attempt budget', async () => {
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt++) {
      const body = change({ currentPassword: randomUUID() });
      last = (await request('PUT', '/api/security-settings', body)).status;
    }
    expect(last).toBe(429);
  });
});
