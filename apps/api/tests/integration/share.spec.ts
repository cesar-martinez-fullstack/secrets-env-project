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

const NEW_PROJECT = { projectId: null, separateEnvironments: [], overwrite: false };

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
      ...NEW_PROJECT,
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

  describe('into a project that already exists', () => {
    interface SecretRow {
      id: number;
      name: string;
      importedAt: string | null;
    }
    let targetProjectId: number;
    let targetEnvId: number;

    const secretsOfTarget = (): Promise<SecretRow[]> =>
      receiver.json<SecretRow[]>('GET', `/api/secrets?environmentId=${targetEnvId}`);
    const reveal = async (id: number): Promise<string> =>
      (await receiver.json<{ value: string }>('POST', `/api/secrets/${id}/reveal`)).value;

    beforeAll(async () => {
      const project = await receiver.json<{ id: number }>('POST', '/api/projects', {
        name: 'Mio',
      });
      targetProjectId = project.id;
      const env = await receiver.json<{ id: number }>('POST', '/api/environments', {
        projectId: targetProjectId,
        name: 'local',
      });
      targetEnvId = env.id;
      for (const [name, value] of [
        ['MY_OWN', 'mine'],
        ['DATABASE_URL', 'keep-me'],
      ]) {
        await receiver.request('POST', '/api/secrets', { environmentId: targetEnvId, name, value });
      }
    });

    it('should tell which environments exist and which variables collide', async () => {
      const content = await exportPackage();

      const preview = await receiver.json<{
        environments: { name: string; secretCount: number; exists: boolean; conflicts: string[] }[];
      }>('POST', '/api/share/preview', {
        content,
        passphrase: PASSPHRASE,
        projectId: targetProjectId,
      });

      expect(preview.environments).toEqual([
        { name: 'Local', secretCount: 1, exists: true, conflicts: ['DATABASE_URL'] },
      ]);
    });

    it('should keep what already exists by default and tell it was skipped', async () => {
      const res = await receiver.request('POST', '/api/share/import', {
        content: await exportPackage(),
        passphrase: PASSPHRASE,
        projectId: targetProjectId,
        separateEnvironments: [],
        overwrite: false,
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        projectName: 'Mio',
        importedCount: 0,
        skippedCount: 1,
      });
      const rows = await secretsOfTarget();
      expect(rows.every((row) => row.importedAt === null)).toBe(true);
      expect(await reveal(rows.find((row) => row.name === 'DATABASE_URL')!.id)).toBe('keep-me');
    });

    it('should overwrite when asked, mark the secret as imported and unmark it when edited', async () => {
      await receiver.request('POST', '/api/share/import', {
        content: await exportPackage(),
        passphrase: PASSPHRASE,
        projectId: targetProjectId,
        separateEnvironments: [],
        overwrite: true,
      });

      const marked = (await secretsOfTarget()).find((row) => row.name === 'DATABASE_URL')!;
      expect(marked.importedAt).not.toBeNull();
      expect(await reveal(marked.id)).toBe(SECRET_VALUE);
      const own = (await secretsOfTarget()).find((row) => row.name === 'MY_OWN')!;
      expect(own.importedAt).toBeNull();

      await receiver.request('PATCH', `/api/secrets/${marked.id}`, { value: 'now-mine' });
      const edited = (await secretsOfTarget()).find((row) => row.name === 'DATABASE_URL')!;
      expect(edited.importedAt).toBeNull();
    });

    it('should create a separate environment when asked to keep them apart', async () => {
      const res = await receiver.request('POST', '/api/share/import', {
        content: await exportPackage(),
        passphrase: PASSPHRASE,
        projectId: targetProjectId,
        separateEnvironments: ['Local'],
        overwrite: false,
      });

      expect(await res.json()).toMatchObject({ environmentCount: 1, importedCount: 1 });
      const envs = await receiver.json<{ projectId: number; name: string }[]>(
        'GET',
        '/api/environments',
      );
      expect(
        envs.filter((env) => env.projectId === targetProjectId).map((env) => env.name),
      ).toEqual(expect.arrayContaining(['local', 'Local (2)']));
    });

    it('should reject a project that does not exist', async () => {
      const res = await receiver.request('POST', '/api/share/import', {
        content: await exportPackage(),
        passphrase: PASSPHRASE,
        projectId: 9999,
        separateEnvironments: [],
        overwrite: false,
      });
      expect(res.status).toBe(404);
    });
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
