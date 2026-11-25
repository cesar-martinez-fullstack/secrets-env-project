import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, createRepositories, openDatabase, SqliteVaultBackup } from '../src';

describe('SqliteVaultBackup', () => {
  let dir: string;
  let handle: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sv-backup-'));
    handle = openDatabase(dir);
  });

  afterEach(() => {
    closeDatabase(handle.db);
    rmSync(dir, { recursive: true, force: true });
  });

  /** Abre la copia como se hace al restaurarla: un archivo `secrets.db` más. */
  function restore(bytes: Uint8Array): Database {
    const file = join(dir, 'restaurada.db');
    writeFileSync(file, bytes);
    return new Database(file);
  }

  async function seed(valueEnc: Uint8Array): Promise<void> {
    const { projects, environments, secrets } = createRepositories(handle.db);
    const project = await projects.create('Proyecto');
    const environment = await environments.create(project.id, 'Local');
    await secrets.create({
      environmentId: environment.id,
      name: 'API_KEY',
      valueEnc,
      noteEnc: null,
    });
  }

  it('should produce a complete SQLite file that includes what is still in the WAL', async () => {
    await seed(new Uint8Array(40).fill(9));

    const bytes = await new SqliteVaultBackup(handle.db).snapshot();

    expect(Buffer.from(bytes.subarray(0, 15)).toString('latin1')).toBe('SQLite format 3');
    const copy = restore(bytes);
    expect(copy.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(copy.query('SELECT name FROM secrets').all()).toEqual([{ name: 'API_KEY' }]);
    copy.close();
  });

  it('should keep the values exactly as stored, never in clear', async () => {
    const plaintext = 'valor-en-claro-que-no-debe-aparecer';
    await seed(new TextEncoder().encode(`cifrado-${'x'.repeat(30)}`));

    const bytes = await new SqliteVaultBackup(handle.db).snapshot();

    expect(Buffer.from(bytes).includes(plaintext)).toBe(false);
    const copy = restore(bytes);
    const row = copy.query<{ value_enc: Uint8Array }, []>('SELECT value_enc FROM secrets').get();
    expect(Buffer.from(row!.value_enc).toString()).toStartWith('cifrado-');
    copy.close();
  });

  it('should not change the original database', async () => {
    await seed(new Uint8Array(40).fill(1));

    await new SqliteVaultBackup(handle.db).snapshot();

    expect(handle.db.query('SELECT COUNT(*) AS total FROM secrets').get()).toEqual({ total: 1 });
  });
});
