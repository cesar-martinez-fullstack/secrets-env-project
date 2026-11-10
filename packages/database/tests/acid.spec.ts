/**
 * Propiedades ACID y de integridad de la capa de datos:
 * migraciones versionadas, atomicidad del Unit of Work y CHECK constraints.
 */
import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  LegacyDatabaseError,
  MIGRATIONS,
  SchemaTooNewError,
  SqliteUnitOfWork,
  createRepositories,
  currentVersion,
  migrate,
  openInMemoryDatabase,
} from '../src';

const BLOB = new Uint8Array(32).fill(5);

describe('migrations', () => {
  it('should bring a fresh database to the latest version', () => {
    const db = new Database(':memory:');
    const applied = migrate(db);
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect(currentVersion(db)).toBe(MIGRATIONS.at(-1)!.version);
  });

  it('should be idempotent: a second run applies nothing', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(migrate(db)).toEqual([]);
  });

  it('should roll back a failing migration and keep the previous version', () => {
    const db = new Database(':memory:');
    migrate(db);
    const before = currentVersion(db);
    const broken = [
      ...MIGRATIONS,
      { version: before + 1, description: 'rota', sql: 'CREATE TABLE ok (id INTEGER); BOOM;' },
    ];
    expect(() => migrate(db, broken)).toThrow();
    expect(currentVersion(db)).toBe(before);
    const leftover = db.query("SELECT name FROM sqlite_master WHERE name = 'ok'").all();
    expect(leftover).toEqual([]);
  });

  it('should reject a pre-migrations database with a clear error and leave it untouched', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE vault_meta (id INTEGER PRIMARY KEY)');

    expect(() => migrate(db)).toThrow(LegacyDatabaseError);
    expect(currentVersion(db)).toBe(0);
  });

  it('should refuse to open a database created by a newer version', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.exec(`PRAGMA user_version = ${MIGRATIONS.at(-1)!.version + 5}`);
    expect(() => migrate(db)).toThrow(SchemaTooNewError);
  });
});

describe('schema constraints (consistency)', () => {
  it('should reject ciphertext blobs shorter than IV+tag (28 bytes)', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    const env = await environments.create('Local');
    await expect(
      secrets.create({
        environmentId: env.id,
        name: 'X',
        valueEnc: new Uint8Array(4),
        noteEnc: null,
      }),
    ).rejects.toThrow();
  });

  it('should reject blank names and orphan secrets', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    await expect(environments.create('   ')).rejects.toThrow();
    await expect(
      secrets.create({ environmentId: 999, name: 'X', valueEnc: BLOB, noteEnc: null }),
    ).rejects.toThrow();
  });
});

describe('SqliteUnitOfWork (atomicity)', () => {
  it('should commit every write when the work succeeds', async () => {
    const db = openInMemoryDatabase();
    const { environments } = createRepositories(db);
    const uow = new SqliteUnitOfWork(db);

    await uow.run(async () => {
      await environments.create('A');
      await environments.create('B');
    });

    expect((await environments.list()).map((e) => e.name)).toEqual(['A', 'B']);
  });

  it('should roll back EVERY write when the work throws midway', async () => {
    const db = openInMemoryDatabase();
    const { environments } = createRepositories(db);
    const uow = new SqliteUnitOfWork(db);

    await expect(
      uow.run(async () => {
        await environments.create('A');
        await environments.create('B');
        throw new Error('crash a mitad de la operacion');
      }),
    ).rejects.toThrow('crash');

    expect(await environments.list()).toEqual([]);
  });

  it('should serialize concurrent units of work without interleaving', async () => {
    const db = openInMemoryDatabase();
    const { environments } = createRepositories(db);
    const uow = new SqliteUnitOfWork(db);
    const order: string[] = [];

    const first = uow.run(async () => {
      order.push('1:start');
      await environments.create('A');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('1:end');
    });
    const second = uow.run(async () => {
      order.push('2:start');
      await environments.create('B');
      order.push('2:end');
    });
    await Promise.all([first, second]);

    expect(order).toEqual(['1:start', '1:end', '2:start', '2:end']);
  });

  it('should keep working after a failed unit of work', async () => {
    const db = openInMemoryDatabase();
    const { environments } = createRepositories(db);
    const uow = new SqliteUnitOfWork(db);

    await uow.run(async () => Promise.reject(new Error('x'))).catch(() => undefined);
    await uow.run(async () => {
      await environments.create('OK');
    });

    expect((await environments.list()).map((e) => e.name)).toEqual(['OK']);
  });

  it('should fail fast on nested units of work instead of deadlocking', async () => {
    const db = openInMemoryDatabase();
    const uow = new SqliteUnitOfWork(db);
    await expect(uow.run(async () => uow.run(async () => 1))).rejects.toThrow('anidado');
  });
});
