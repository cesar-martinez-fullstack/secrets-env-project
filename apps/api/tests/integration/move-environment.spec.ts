import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const VALUE = 'valor que debe seguir abriendo tras mover';

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

async function created<T = { id: number }>(path: string, body: unknown): Promise<T> {
  return (await (await request('POST', path, body)).json()) as T;
}

async function projectOf(environmentId: number): Promise<number | undefined> {
  const list = (await (await request('GET', '/api/environments')).json()) as {
    id: number;
    projectId: number;
  }[];
  return list.find((env) => env.id === environmentId)?.projectId;
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-move-'));
  container = createContainer(makeTestConfig(root));
  app = createApp(container);
  const res = await request('POST', '/api/vault/setup', { masterPassword: randomUUID() });
  session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
});

afterAll(() => {
  disposeContainer(container);
  rmSync(root, { recursive: true, force: true });
});

describe('POST /api/environments/:id/move', () => {
  it('should keep values and notes readable after moving, and audit it', async () => {
    const target = await created('/api/projects', { name: 'Destino' });
    const env = await created('/api/environments', { projectId: 1, name: 'Staging' });
    const secret = await created('/api/secrets', {
      environmentId: env.id,
      name: 'VARIABLE_DEMO',
      value: VALUE,
      note: 'nota que viaja',
    });

    const res = await request('POST', `/api/environments/${env.id}/move`, {
      projectId: target.id,
    });

    expect(res.status).toBe(200);
    expect(await projectOf(env.id)).toBe(target.id);
    const revealed = await created<{ value: string; note: string }>(
      `/api/secrets/${secret.id}/reveal`,
      {},
    );
    expect(revealed.value).toBe(VALUE);
    expect(revealed.note).toBe('nota que viaja');
    const audit = await (await request('GET', '/api/audit')).text();
    expect(audit).toContain('env.moved');
    expect(audit).not.toContain(VALUE);
  });

  it('should answer 409 and change nothing when the name is taken in the target', async () => {
    const target = await created('/api/projects', { name: 'Ocupado' });
    await created('/api/environments', { projectId: target.id, name: 'QA' });
    const env = await created('/api/environments', { projectId: 1, name: 'qa' });

    const res = await request('POST', `/api/environments/${env.id}/move`, {
      projectId: target.id,
    });

    expect(res.status).toBe(409);
    expect(await projectOf(env.id)).toBe(1);
  });

  it('should validate the environment, the target and the body', async () => {
    const env = await created('/api/environments', { projectId: 1, name: 'Validar' });
    const move = async (id: number | string, body: unknown) =>
      (await request('POST', `/api/environments/${id}/move`, body)).status;

    expect(await move(9999, { projectId: 1 })).toBe(404);
    expect(await move(env.id, { projectId: 9999 })).toBe(404);
    expect(await move(env.id, { projectId: 1 })).toBe(400);
    expect(await move(env.id, {})).toBe(400);
    expect(await move('abc', { projectId: 1 })).toBe(400);
  });
});
