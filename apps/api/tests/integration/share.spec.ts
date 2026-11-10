import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app';
import { createContainer, disposeContainer, type Container } from '../../src/container';
import { makeTestConfig } from '../helpers/test-config';

const PASSPHRASE = 'una frase de paso larga';
const SECRET_VALUE = 'postgres://user:hunter2@db/app';

class Instance {
  readonly container: Container;
  readonly app: ReturnType<typeof createApp>;
  private session = '';

  constructor(readonly dir: string) {
    this.container = createContainer(makeTestConfig(dir));
    this.app = createApp(this.container);
  }

  async request(method: string, path: string, body?: unknown): Promise<Response> {
    return this.app.request(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.session ? { Cookie: `sv_session=${this.session}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async setup(): Promise<void> {
    const res = await this.request('POST', '/api/vault/setup', {
      masterPassword: 'IntegracionTest2024!',
    });
    this.session = /sv_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.request(method, path, body)).json()) as T;
  }
}

let root: string;
let sender: Instance;
let receiver: Instance;
let projectId: number;
let environmentId: number;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sv-share-'));
  sender = new Instance(join(root, 'sender'));
  receiver = new Instance(join(root, 'receiver'));
  await sender.setup();
  await receiver.setup();

  const project = await sender.json<{ id: number }>('POST', '/api/projects', { name: 'Checkout' });
  projectId = project.id;
  const env = await sender.json<{ id: number }>('POST', '/api/environments', {
    projectId,
    name: 'Local',
  });
  environmentId = env.id;
  await sender.request('POST', '/api/secrets', {
    environmentId,
    name: 'DATABASE_URL',
    value: SECRET_VALUE,
    note: 'rotate monthly',
  });
});

afterAll(() => {
  disposeContainer(sender.container);
  disposeContainer(receiver.container);
  rmSync(root, { recursive: true, force: true });
});

interface SharedFile {
  filename: string;
  content: string;
}

async function exportFile(passphrase = PASSPHRASE): Promise<SharedFile> {
  const res = await sender.request('POST', `/api/share/projects/${projectId}/export`, {
    passphrase,
  });
  return (await res.json()) as SharedFile;
}

const exportPackage = async (passphrase = PASSPHRASE): Promise<string> =>
  (await exportFile(passphrase)).content;

describe('compartir un proyecto entre dos bóvedas', () => {
  it('should return an encrypted package with a safe filename', async () => {
    const res = await sender.request('POST', `/api/share/projects/${projectId}/export`, {
      passphrase: PASSPHRASE,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const file = (await res.json()) as SharedFile;
    expect(file.filename).toBe('secretvault-checkout.svshare');
    for (const leaked of [SECRET_VALUE, 'DATABASE_URL', 'Checkout', 'Local', PASSPHRASE]) {
      expect(file.content).not.toContain(leaked);
    }
  });

  it('should open the package in another vault as a new project with its environments', async () => {
    const content = await exportPackage();

    const preview = await receiver.json<{ projectName: string; secretCount: number }>(
      'POST',
      '/api/share/preview',
      { content, passphrase: PASSPHRASE },
    );
    expect(preview).toMatchObject({ projectName: 'Checkout', secretCount: 1 });

    const res = await receiver.request('POST', '/api/share/import', {
      content,
      passphrase: PASSPHRASE,
    });
    expect(res.status).toBe(201);
    const imported = (await res.json()) as { projectId: number };

    const envs = await receiver.json<{ id: number; projectId: number; name: string }[]>(
      'GET',
      '/api/environments',
    );
    const copied = envs.find((env) => env.projectId === imported.projectId);
    expect(copied?.name).toBe('Local');

    const list = await receiver.json<{ id: number; name: string }[]>(
      'GET',
      `/api/secrets?environmentId=${copied?.id}`,
    );
    const revealed = await receiver.json<{ value: string; note: string }>(
      'POST',
      `/api/secrets/${list[0]?.id}/reveal`,
    );
    expect(revealed).toMatchObject({ value: SECRET_VALUE, note: 'rotate monthly' });
  });

  it('should reject the same way a wrong passphrase and a tampered file', async () => {
    const content = await exportPackage();
    const tampered = content.replace(
      /"data":"(.)/,
      (_, first: string) => `"data":"${first === 'A' ? 'B' : 'A'}`,
    );

    for (const [text, passphrase] of [
      [content, 'otra frase distinta'],
      [tampered, PASSPHRASE],
    ] as const) {
      const res = await receiver.request('POST', '/api/share/preview', {
        content: text,
        passphrase,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'SHARE_PACKAGE_INVALID' } });
    }
  });

  it('should refuse to export with a short passphrase', async () => {
    const res = await sender.request('POST', `/api/share/projects/${projectId}/export`, {
      passphrase: 'corta',
    });
    expect(res.status).toBe(400);
  });

  it('should rate limit repeated attempts to open packages', async () => {
    const content = await exportPackage();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 14; attempt++) {
      const res = await receiver.request('POST', '/api/share/preview', {
        content,
        passphrase: 'frase equivocada',
      });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
