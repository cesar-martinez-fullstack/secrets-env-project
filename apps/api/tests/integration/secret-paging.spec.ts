import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

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

async function list(query: string): Promise<{ names: string[]; total: string | null }> {
  const res = await request('GET', `/api/secrets${query}`);
  const items = (await res.json()) as { name: string }[];
  return { names: items.map((item) => item.name), total: res.headers.get('x-total-count') };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-paging-'));
  container = createContainer(makeTestConfig(root));
  app = createApp(container);
  const res = await request('POST', '/api/vault/setup', { masterPassword: randomUUID() });
  session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  const entries = Array.from({ length: 7 }, (_, i) => ({ name: `VAR_${i}`, value: `v${i}` }));
  await request('POST', '/api/secrets/import', { environmentId: 1, entries, overwrite: false });
});

afterAll(() => {
  disposeContainer(container);
  rmSync(root, { recursive: true, force: true });
});

describe('GET /api/secrets paging', () => {
  it('should keep returning everything when no limit is asked, with the total', async () => {
    const result = await list('?environmentId=1');
    expect(result.names).toHaveLength(7);
    expect(result.total).toBe('7');
  });

  it('should return one sorted page and the total of all matches', async () => {
    expect(await list('?environmentId=1&limit=3&offset=3&order=desc')).toEqual({
      names: ['VAR_3', 'VAR_2', 'VAR_1'],
      total: '7',
    });
    expect(await list('?environmentId=1&limit=3&offset=6')).toEqual({
      names: ['VAR_6'],
      total: '7',
    });
  });

  it('should apply the search to both the page and the total', async () => {
    expect(await list('?q=var_5&limit=3')).toEqual({ names: ['VAR_5'], total: '1' });
  });

  it.each([
    'limit=0',
    'limit=201',
    'limit=abc',
    'limit=2.5',
    'limit=2&offset=-1',
    'offset=2',
    'order=random',
  ])('should reject %s', async (query) => {
    expect((await request('GET', `/api/secrets?${query}`)).status).toBe(400);
  });

  it('should require a session', async () => {
    const open = session;
    session = '';
    const res = await request('GET', '/api/secrets?limit=2');
    session = open;
    expect(res.status).toBe(401);
    expect(res.headers.get('x-total-count')).toBeNull();
  });
});
