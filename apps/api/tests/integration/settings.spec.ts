import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_APPEARANCE, LOGO_MAX_BYTES, encodeBase64 } from '@secretvault/shared';
import type { AuditQueryResultDto, SettingsDto } from '@secretvault/shared';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const APPEARANCE = { appName: 'Mi Bóveda', accent: 'violet', defaultTheme: 'dark' } as const;

let root: string;
let container: Container;
let app: ReturnType<typeof createApp>;
let session = '';

const request = (method: string, path: string, body?: unknown, withSession = true) =>
  app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(withSession && session ? { Cookie: `sv_session=${session}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const putLogo = (bytes: Uint8Array, withSession = true) =>
  request('PUT', '/api/settings/logo', { data: encodeBase64(bytes) }, withSession);

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-settings-api-'));
  container = createContainer(makeTestConfig(root));
  app = createApp(container);
  const res = await request('POST', '/api/vault/setup', { masterPassword: 'IntegracionTest2024!' });
  session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
});

afterAll(() => {
  disposeContainer(container);
  rmSync(root, { recursive: true, force: true });
});

describe('settings API', () => {
  it('should answer without a session so the entry screen can show the logo', async () => {
    const res = await request('GET', '/api/settings', undefined, false);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      hasLogo: false,
      logoVersion: null,
      ...DEFAULT_APPEARANCE,
    } satisfies SettingsDto);
  });

  it('should answer 404 for the logo while none is set', async () => {
    expect((await request('GET', '/api/settings/logo', undefined, false)).status).toBe(404);
  });

  it('should require an unlocked vault to change or remove the logo', async () => {
    expect((await putLogo(PNG, false)).status).toBe(401);
    expect((await request('DELETE', '/api/settings/logo', undefined, false)).status).toBe(401);
  });

  it('should reject content that is not a supported image', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>');

    const res = await putLogo(svg);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LOGO_INVALID');
  });

  it('should reject an image over the size limit', async () => {
    const huge = new Uint8Array(LOGO_MAX_BYTES + 1);
    huge.set(PNG);

    expect((await putLogo(huge)).status).toBe(400);
  });

  it('should reject a body without valid base64 data', async () => {
    expect((await request('PUT', '/api/settings/logo', {})).status).toBe(400);
    expect((await request('PUT', '/api/settings/logo', { data: '***not base64***' })).status).toBe(
      400,
    );
  });

  it('should store the logo and serve it back with hardened headers', async () => {
    const saved = await putLogo(PNG);
    expect(saved.status).toBe(200);
    const settings = (await saved.json()) as SettingsDto;
    expect(settings.hasLogo).toBe(true);
    expect(settings.logoVersion).toBeGreaterThan(0);

    const served = await request('GET', '/api/settings/logo', undefined, false);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('cache-control')).toBe('no-store');
    expect(Array.from(new Uint8Array(await served.arrayBuffer()))).toEqual(Array.from(PNG));
  });

  it('should keep the logo after the server restarts', async () => {
    const reopened = createContainer(makeTestConfig(root));
    try {
      const res = await createApp(reopened).request('/api/settings');
      expect(((await res.json()) as SettingsDto).hasLogo).toBe(true);
    } finally {
      disposeContainer(reopened);
    }
  });

  it('should audit the change without the image bytes', async () => {
    const res = await request('GET', '/api/audit');
    const { events } = (await res.json()) as AuditQueryResultDto;

    const changed = events.find((event) => event.type === 'settings.logo_changed');
    expect(changed).toBeDefined();
    expect(changed?.message).not.toContain(encodeBase64(PNG));
  });

  it('should require an unlocked vault to change the appearance', async () => {
    const res = await request('PUT', '/api/settings/appearance', APPEARANCE, false);

    expect(res.status).toBe(401);
  });

  it('should reject an invalid appearance', async () => {
    for (const body of [
      { ...APPEARANCE, appName: '' },
      { ...APPEARANCE, accent: 'red; background: url(x)' },
      { ...APPEARANCE, defaultTheme: 'sepia' },
      {},
    ]) {
      expect((await request('PUT', '/api/settings/appearance', body)).status).toBe(400);
    }
  });

  it('should store the appearance, expose it without a session and keep it after a restart', async () => {
    const saved = await request('PUT', '/api/settings/appearance', APPEARANCE);
    expect(saved.status).toBe(200);

    const reopened = createContainer(makeTestConfig(root));
    try {
      const res = await createApp(reopened).request('/api/settings');
      expect(await res.json()).toMatchObject(APPEARANCE);
    } finally {
      disposeContainer(reopened);
    }
  });

  it('should remove the logo', async () => {
    const removed = await request('DELETE', '/api/settings/logo');
    expect(((await removed.json()) as SettingsDto).hasLogo).toBe(false);

    expect((await request('GET', '/api/settings/logo', undefined, false)).status).toBe(404);
  });
});
