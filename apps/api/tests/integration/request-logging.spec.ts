import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const marker = () => `marca-${randomUUID()}`;
const sensitive = {
  master: marker(),
  value: marker(),
  note: marker(),
  search: marker(),
  phrase: marker(),
  unknownPath: marker(),
  header: marker(),
};

let root: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let session = '';
let recoveryKey = '';
const lines: string[] = [];

type Entry = Record<string, unknown>;
const entries = (): Entry[] => lines.map((line) => JSON.parse(line) as Entry);
const requests = () => entries().filter((entry) => entry.event === 'http.request');

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: sensitive.header,
      'X-Request-Id': sensitive.header,
      ...(session ? { Cookie: `sv_session=${session}` } : {}),
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

function boot(): void {
  container = createContainer(makeTestConfig(root, { logLevel: 'debug' }), {
    logWriter: (line) => lines.push(line),
  });
  app = createApp(container);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-logs-'));
  boot();
  const res = await request('POST', '/api/vault/setup', { masterPassword: sensitive.master });
  recoveryKey = ((await res.json()) as { recoveryKey: string }).recoveryKey;
  session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
});

afterAll(() => {
  disposeContainer(container);
  rmSync(root, { recursive: true, force: true });
});

describe('request logging', () => {
  it('should never write secrets, even at debug level across a full session', async () => {
    const created = (await (
      await request('POST', '/api/secrets', {
        environmentId: 1,
        name: 'VARIABLE_DEMO',
        value: sensitive.value,
        note: sensitive.note,
      })
    ).json()) as { id: number };
    await request('POST', `/api/secrets/${created.id}/reveal`);
    await request('GET', `/api/secrets?q=${sensitive.search}`);
    await request('POST', '/api/share/projects/1/export', { passphrase: sensitive.phrase });
    await request('GET', `/api/${sensitive.unknownPath}`);
    await request('GET', `/${sensitive.unknownPath}`);
    await request('POST', '/api/secrets', `{"value": "${sensitive.value}" roto`);
    await request('POST', '/api/vault/unlock', { masterPassword: marker() });

    const all = lines.join('\n');
    for (const secret of [...Object.values(sensitive), recoveryKey, session]) {
      expect(secret.length).toBeGreaterThan(8);
      expect(all).not.toContain(secret);
    }
    expect(all).not.toContain('VARIABLE_DEMO');
  });

  it('should log the route pattern, status, duration and the id returned to the client', async () => {
    const res = await request('POST', '/api/secrets/999/reveal');

    const id = res.headers.get('x-request-id')!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const entry = requests().find((item) => item.requestId === id)!;
    expect(entry).toMatchObject({
      method: 'POST',
      route: '/api/secrets/:id/reveal',
      status: 404,
      code: 'SECRET_NOT_FOUND',
      level: 'info',
    });
    expect(typeof entry.ms).toBe('number');
  });

  it('should raise the level for refused access and keep health checks at debug', async () => {
    lines.length = 0;
    const open = session;
    session = '';
    await request('GET', '/api/projects');
    session = open;
    await request('GET', '/api/health');

    expect(requests().map((e) => [e.route, e.level])).toEqual([
      ['/api/projects', 'warn'],
      ['/api/health', 'debug'],
    ]);
  });

  it('should record unexpected errors without their message', async () => {
    const leaked = marker();
    const spy = spyOn(container.projectService, 'list').mockRejectedValue(new TypeError(leaked));
    lines.length = 0;

    const res = await request('GET', '/api/projects');
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(lines.join('\n')).not.toContain(leaked);
    const failure = entries().find((e) => e.event === 'http.unexpected_error')!;
    expect(failure).toMatchObject({ level: 'error', errorName: 'TypeError' });
    expect(failure.stack).toContain('at ');
    expect(failure.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('should change the level from settings with the password and keep it after a restart', async () => {
    const wrong = await request('PUT', '/api/security-settings/log-level', {
      currentPassword: marker(),
      level: 'error',
    });
    expect(wrong.status).toBe(401);

    const saved = await request('PUT', '/api/security-settings/log-level', {
      currentPassword: sensitive.master,
      level: 'error',
    });
    expect(saved.status).toBe(200);
    lines.length = 0;
    await request('GET', '/api/projects');
    expect(lines).toHaveLength(0);
    expect(await (await request('GET', '/api/audit')).text()).toContain(
      'Nivel de registro: debug → error.',
    );

    disposeContainer(container);
    boot();
    await container.logLevelService.load();
    session = '';
    const unlocked = await request('POST', '/api/vault/unlock', {
      masterPassword: sensitive.master,
    });
    session = /sv_session=([^;]+)/.exec(unlocked.headers.get('set-cookie') ?? '')?.[1] ?? '';
    const current = await (await request('GET', '/api/security-settings/log-level')).json();
    expect(current).toEqual({ level: 'error', options: ['debug', 'info', 'warn', 'error'] });
    expect(lines).toHaveLength(0);
  });

  it('should reject unknown levels and require a session', async () => {
    const invalid = await request('PUT', '/api/security-settings/log-level', {
      currentPassword: sensitive.master,
      level: 'silent',
    });
    expect(invalid.status).toBe(400);
    session = '';
    expect((await request('GET', '/api/security-settings/log-level')).status).toBe(401);
  });
});
