/**
 * La comprobación de actualizaciones de punta a punta sobre el contenedor real, con una fuente de
 * versiones falsa (los tests nunca salen a internet).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateCheckFailedError, type LatestRelease, type ReleaseSource } from '@secretvault/core';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { APP_VERSION } from '../../src/version';
import { makeTestConfig } from '../helpers/test-config';

const OFFICIAL = 'https://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag';
const PASSWORD = 'IntegracionUpdate2026!';

class FakeSource implements ReleaseSource {
  calls = 0;
  next: LatestRelease | null | Error = { tag: 'v99.0.0', url: `${OFFICIAL}/v99.0.0` };

  async latestRelease(): Promise<LatestRelease | null> {
    this.calls++;
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

let rootDir: string;
const containers: Container[] = [];

function build(overrides: Parameters<typeof makeTestConfig>[1], source: FakeSource) {
  const config = makeTestConfig(rootDir, {
    ...overrides,
    dataDir: join(rootDir, `d${containers.length}`),
  });
  const container = createContainer(config, { releaseSource: source });
  containers.push(container);
  return createApp(container);
}

async function unlocked(app: ReturnType<typeof createApp>): Promise<Record<string, string>> {
  const res = await app.request('/api/vault/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ masterPassword: PASSWORD }),
  });
  const session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  return { Cookie: `sv_session=${session}`, 'Content-Type': 'application/json' };
}

const check = (app: ReturnType<typeof createApp>, headers: Record<string, string> = {}) =>
  app.request('/api/update/check', { method: 'POST', headers });

beforeAll(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'sv-update-'));
  const publicDir = join(rootDir, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>SecretVault</title>');
});

afterAll(() => {
  for (const container of containers) disposeContainer(container);
  rmSync(rootDir, { recursive: true, force: true });
});

describe('POST /api/update/check', () => {
  it('should report a newer version with the installed one, and audit the check', async () => {
    const source = new FakeSource();
    const app = build({}, source);
    const headers = await unlocked(app);

    const res = await check(app, headers);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      currentVersion: APP_VERSION,
      latestVersion: '99.0.0',
      updateAvailable: true,
      releaseUrl: `${OFFICIAL}/v99.0.0`,
    });
    const audit = (await (await app.request('/api/audit', { headers })).json()) as {
      events: { type: string }[];
    };
    expect(audit.events.some((event: { type: string }) => event.type === 'update.checked')).toBe(
      true,
    );
  });

  it('should say the installation is up to date when the latest release is the installed one', async () => {
    const source = new FakeSource();
    source.next = { tag: `v${APP_VERSION}`, url: `${OFFICIAL}/v${APP_VERSION}` };
    const app = build({}, source);

    const res = await check(app, await unlocked(app));

    expect(await res.json()).toMatchObject({ updateAvailable: false });
  });

  it('should refuse without a session and never reach the source', async () => {
    const source = new FakeSource();
    const app = build({}, source);

    const res = await check(app);

    expect(res.status).toBe(401);
    expect(source.calls).toBe(0);
  });

  it('should refuse and make no request when the check is disabled by configuration', async () => {
    const source = new FakeSource();
    const app = build({ updateCheckEnabled: false }, source);

    const res = await check(app, await unlocked(app));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'UPDATE_CHECK_DISABLED' } });
    expect(source.calls).toBe(0);
  });

  it('should answer 502 with a stable code when GitHub cannot be reached', async () => {
    const source = new FakeSource();
    source.next = new UpdateCheckFailedError();
    const app = build({}, source);

    const res = await check(app, await unlocked(app));

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: 'UPDATE_CHECK_FAILED' } });
  });

  it('should reject a release page that is not in the official repository', async () => {
    const source = new FakeSource();
    source.next = { tag: 'v99.0.0', url: 'https://evil.example/releases/tag/v99.0.0' };
    const app = build({}, source);

    const res = await check(app, await unlocked(app));

    expect(res.status).toBe(502);
  });

  it('should limit how often the check can be triggered', async () => {
    const source = new FakeSource();
    const app = build({}, source);
    const headers = await unlocked(app);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt++) statuses.push((await check(app, headers)).status);

    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(source.calls).toBe(5);
  });
});
