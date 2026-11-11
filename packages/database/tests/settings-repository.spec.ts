import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_APPEARANCE } from '@secretvault/shared';
import { FileSettingsRepository } from '../src/settings/file-settings-repository';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 8, 9]);
const UPDATED = new Date('2026-03-01T10:00:00.000Z');

describe('FileSettingsRepository', () => {
  let dir: string;
  let repo: FileSettingsRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sv-settings-'));
    repo = new FileSettingsRepository(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return the defaults when nothing has been saved', async () => {
    expect(await repo.load()).toEqual({ logo: null, appearance: DEFAULT_APPEARANCE });
  });

  it('should round-trip a logo', async () => {
    await repo.save({
      logo: { mimeType: 'image/png', data: PNG, updatedAt: UPDATED },
      appearance: DEFAULT_APPEARANCE,
    });

    const loaded = await new FileSettingsRepository(dir).load();

    expect(loaded.logo?.mimeType).toBe('image/png');
    expect(Array.from(loaded.logo?.data ?? [])).toEqual(Array.from(PNG));
    expect(loaded.logo?.updatedAt).toEqual(UPDATED);
  });

  it('should leave no temporary file behind after saving', async () => {
    await repo.save({
      logo: { mimeType: 'image/png', data: PNG, updatedAt: UPDATED },
      appearance: DEFAULT_APPEARANCE,
    });

    expect(readdirSync(dir)).toEqual(['settings.json']);
  });

  it('should return the defaults when the file is not valid JSON', async () => {
    writeFileSync(join(dir, 'settings.json'), '{not json');

    expect(await repo.load()).toEqual({ logo: null, appearance: DEFAULT_APPEARANCE });
  });

  it('should ignore a logo whose bytes do not match its declared type', async () => {
    const forged = {
      version: 1,
      logo: {
        mimeType: 'image/png',
        data: Buffer.from('<svg onload="alert(1)"/>').toString('base64'),
        updatedAt: UPDATED.toISOString(),
      },
    };
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(forged));

    expect((await repo.load()).logo).toBeNull();
  });

  it('should ignore a logo with an unsupported declared type', async () => {
    const forged = {
      version: 1,
      logo: {
        mimeType: 'text/html',
        data: Buffer.from(PNG).toString('base64'),
        updatedAt: UPDATED.toISOString(),
      },
    };
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(forged));

    expect((await repo.load()).logo).toBeNull();
  });

  it('should round-trip the appearance', async () => {
    const appearance = { appName: 'Mi Bóveda', accent: 'rose', defaultTheme: 'light' } as const;
    await repo.save({ logo: null, appearance });

    expect((await new FileSettingsRepository(dir).load()).appearance).toEqual(appearance);
  });

  it('should fall back to the default for each invalid appearance field', async () => {
    const forged = {
      version: 1,
      appearance: { appName: 'a\nb', accent: 'red; x', defaultTheme: 'sepia' },
    };
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(forged));

    expect((await repo.load()).appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('should keep the valid fields when only some are invalid', async () => {
    const forged = { version: 1, appearance: { appName: 'Casa', accent: 'nope' } };
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(forged));

    expect((await repo.load()).appearance).toEqual({ ...DEFAULT_APPEARANCE, appName: 'Casa' });
  });

  it('should store the file in the data directory as versioned JSON', async () => {
    await repo.save({ logo: null, appearance: DEFAULT_APPEARANCE });

    const written = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      version: number;
    };
    expect(written.version).toBe(1);
  });
});
