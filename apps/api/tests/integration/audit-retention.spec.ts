/** Retención y vaciado del historial de auditoría, de punta a punta sobre el contenedor real. */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const MASTER = 'AuditoriaRetencion2026!';
const WRONG = `${MASTER}-mal`;

let rootDir: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let headers: Record<string, string>;

const request = (method: string, path: string, body?: object, withSession = true) =>
  app.request(path, {
    method,
    headers: withSession ? headers : { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

async function auditTypes(): Promise<string[]> {
  const res = await request('GET', '/api/audit?limit=100');
  const { events } = (await res.json()) as { events: { type: string }[] };
  return events.map((event) => event.type);
}

beforeAll(async () => {
  rootDir = mkdtempSync(join(tmpdir(), 'sv-audit-'));
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

describe('audit retention', () => {
  it('should require a session on every audit settings route', async () => {
    expect((await request('GET', '/api/audit/retention', undefined, false)).status).toBe(401);
    const body = { maxEvents: 500, currentPassword: MASTER };
    expect((await request('PUT', '/api/audit/retention', body, false)).status).toBe(401);
    expect(
      (await request('POST', '/api/audit/clear', { currentPassword: MASTER }, false)).status,
    ).toBe(401);
  });

  it('should report the default retention and the available options', async () => {
    const res = await request('GET', '/api/audit/retention');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ maxEvents: 1_000, options: [500, 1_000, 5_000, 10_000] });
  });

  it('should refuse a wrong password and a value outside the options, changing nothing', async () => {
    const wrong = await request('PUT', '/api/audit/retention', {
      maxEvents: 500,
      currentPassword: WRONG,
    });
    const odd = await request('PUT', '/api/audit/retention', {
      maxEvents: 700,
      currentPassword: MASTER,
    });
    const text = await request('PUT', '/api/audit/retention', {
      maxEvents: '500',
      currentPassword: MASTER,
    });

    expect(wrong.status).toBe(401);
    expect(odd.status).toBe(400);
    expect(text.status).toBe(400);
    expect(await (await request('GET', '/api/audit/retention')).json()).toMatchObject({
      maxEvents: 1_000,
    });
  });

  it('should change the retention after confirming the password and audit the change', async () => {
    const res = await request('PUT', '/api/audit/retention', {
      maxEvents: 5_000,
      currentPassword: MASTER,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ maxEvents: 5_000 });
    expect(await auditTypes()).toContain('audit.retention_changed');
  });
});

describe('clearing the audit history', () => {
  it('should refuse a wrong password, keep the history and record the failed attempt', async () => {
    const before = await auditTypes();

    const res = await request('POST', '/api/audit/clear', { currentPassword: WRONG });

    expect(res.status).toBe(401);
    expect(await auditTypes()).toEqual(['vault.reauth_failed', ...before]);
  });

  it('should wipe the history and leave a single event saying it was cleared', async () => {
    const before = (await auditTypes()).length;

    const res = await request('POST', '/api/audit/clear', { currentPassword: MASTER });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: before });
    expect(await auditTypes()).toEqual(['audit.cleared']);
  });
});
