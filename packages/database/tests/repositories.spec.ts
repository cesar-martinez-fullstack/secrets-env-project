/**
 * Tests de integración de los repositorios SQLite reales (en memoria).
 * Verifican esquema, constraints (UNIQUE/CASCADE), búsqueda y poda de auditoría.
 */
import { describe, expect, it } from 'bun:test';
import { createRepositories, openInMemoryDatabase, closeDatabase } from '../src';

// Los blobs reales miden >= 28 bytes (IV 12 + tag 16); el esquema lo exige con un CHECK.
const VALUE_A = new Uint8Array(32).fill(1);
const VALUE_B = new Uint8Array(32).fill(9);

describe('SqliteVaultRepository', () => {
  it('should start empty and persist a single upsertable row', async () => {
    const db = openInMemoryDatabase();
    const { vault } = createRepositories(db);
    expect(await vault.get()).toBeNull();

    const info = {
      salt: new Uint8Array(16).fill(1),
      iterations: 310_000,
      verifier: new Uint8Array(48).fill(2),
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      formatVersion: 2 as const,
      wrappedDek: new Uint8Array(60).fill(3),
      recoverySalt: new Uint8Array(16).fill(4),
      recoveryWrappedDek: new Uint8Array(60).fill(5),
    };
    await vault.save(info);

    const loaded = await vault.get();
    expect(loaded?.iterations).toBe(310_000);
    expect(Buffer.from(loaded!.salt).equals(Buffer.from(info.salt))).toBe(true);
    expect(Buffer.from(loaded!.verifier).equals(Buffer.from(info.verifier))).toBe(true);
    expect(loaded?.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(loaded?.formatVersion).toBe(2);
    expect(Buffer.from(loaded!.wrappedDek!).equals(Buffer.from(info.wrappedDek))).toBe(true);
    expect(
      Buffer.from(loaded!.recoveryWrappedDek!).equals(Buffer.from(info.recoveryWrappedDek)),
    ).toBe(true);

    // Upsert: sobrescribe la fila única
    await vault.save({ ...info, iterations: 500_000 });
    expect((await vault.get())?.iterations).toBe(500_000);
    closeDatabase(db);
  });
});

describe('SqliteEnvironmentRepository', () => {
  it('should create, list with counts, rename and delete', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);

    const local = await environments.create(1, 'Local');
    await environments.create(1, 'QA');
    await secrets.create({ environmentId: local.id, name: 'A', valueEnc: VALUE_A, noteEnc: null });
    await secrets.create({ environmentId: local.id, name: 'B', valueEnc: VALUE_B, noteEnc: null });

    const withCounts = await environments.listWithCounts();
    expect(withCounts.map((e) => `${e.name}:${e.secretCount}`)).toEqual(['Local:2', 'QA:0']);

    await environments.rename(local.id, 'Desarrollo');
    expect((await environments.findById(local.id))?.name).toBe('Desarrollo');

    await environments.delete(local.id);
    expect(await environments.findById(local.id)).toBeNull();
    closeDatabase(db);
  });

  it('should enforce unique names case-insensitively', async () => {
    const db = openInMemoryDatabase();
    const { environments } = createRepositories(db);
    await environments.create(1, 'Local');
    expect(await environments.findByName(1, 'LOCAL')).not.toBeNull();
    expect(() => environments.create(1, 'local')).toThrow(); // UNIQUE COLLATE NOCASE
    closeDatabase(db);
  });

  it('should list in creation order', async () => {
    const db = openInMemoryDatabase();
    const { environments } = createRepositories(db);
    await environments.create(1, 'B');
    await environments.create(1, 'A');
    expect((await environments.list()).map((e) => e.name)).toEqual(['B', 'A']);
    closeDatabase(db);
  });
});

describe('SqliteSecretRepository', () => {
  it('should create, read, update and delete secrets with their encrypted blobs intact', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    const env = await environments.create(1, 'Local');

    const created = await secrets.create({
      environmentId: env.id,
      name: 'DATABASE_URL',
      valueEnc: VALUE_A,
      noteEnc: VALUE_B,
    });

    const loaded = await secrets.findById(created.id);
    expect(loaded?.environmentName).toBe('Local');
    expect(Buffer.from(loaded!.valueEnc).equals(Buffer.from(VALUE_A))).toBe(true);
    expect(Buffer.from(loaded!.noteEnc!).equals(Buffer.from(VALUE_B))).toBe(true);

    const updated = await secrets.update(created.id, { valueEnc: VALUE_B, noteEnc: null });
    expect(Buffer.from(updated.valueEnc).equals(Buffer.from(VALUE_B))).toBe(true);
    expect(updated.noteEnc).toBeNull();

    await secrets.delete(created.id);
    expect(await secrets.findById(created.id)).toBeNull();
    closeDatabase(db);
  });

  it('should enforce unique names per environment (case-insensitive) but allow across environments', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    const local = await environments.create(1, 'Local');
    const qa = await environments.create(1, 'QA');

    await secrets.create({
      environmentId: local.id,
      name: 'KEY',
      valueEnc: VALUE_A,
      noteEnc: null,
    });
    // mismo nombre en otro ambiente: permitido
    await secrets.create({ environmentId: qa.id, name: 'KEY', valueEnc: VALUE_B, noteEnc: null });
    // mismo nombre en el mismo ambiente: UNIQUE(environment_id, name)
    expect(() =>
      secrets.create({ environmentId: local.id, name: 'key', valueEnc: VALUE_B, noteEnc: null }),
    ).toThrow();
    closeDatabase(db);
  });

  it('should filter by environment and search by substring case-insensitively', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    const local = await environments.create(1, 'Local');
    const qa = await environments.create(1, 'QA');

    await secrets.create({
      environmentId: local.id,
      name: 'DATABASE_URL',
      valueEnc: VALUE_A,
      noteEnc: null,
    });
    await secrets.create({
      environmentId: local.id,
      name: 'API_KEY',
      valueEnc: VALUE_A,
      noteEnc: null,
    });
    await secrets.create({
      environmentId: qa.id,
      name: 'DATABASE_URL_QA',
      valueEnc: VALUE_B,
      noteEnc: null,
    });

    const allLocal = await secrets.list({ environmentId: local.id });
    expect(allLocal.map((s) => s.name)).toEqual(['API_KEY', 'DATABASE_URL']); // orden alfabético

    const globalSearch = await secrets.list({ query: 'database' });
    expect(globalSearch.map((s) => s.name)).toEqual(['DATABASE_URL', 'DATABASE_URL_QA']);

    const none = await secrets.list({ query: 'inexistente' });
    expect(none).toEqual([]);
    closeDatabase(db);
  });

  it('should cascade-delete secrets when the environment is removed', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    const env = await environments.create(1, 'Local');
    const s = await secrets.create({
      environmentId: env.id,
      name: 'A',
      valueEnc: VALUE_A,
      noteEnc: null,
    });

    await environments.delete(env.id);
    expect(await secrets.findById(s.id)).toBeNull();
    closeDatabase(db);
  });

  it('should store, read and clear the imported mark', async () => {
    const db = openInMemoryDatabase();
    const { environments, secrets } = createRepositories(db);
    const env = await environments.create(1, 'Local');
    const importedAt = new Date('2024-03-05T10:00:00.000Z');

    const plain = await secrets.create({
      environmentId: env.id,
      name: 'OWN_KEY',
      valueEnc: VALUE_A,
      noteEnc: null,
    });
    const received = await secrets.create({
      environmentId: env.id,
      name: 'RECEIVED_KEY',
      valueEnc: VALUE_A,
      noteEnc: null,
      importedAt,
    });

    expect(plain.importedAt).toBeNull();
    expect((await secrets.findById(received.id))?.importedAt).toEqual(importedAt);
    expect((await secrets.findByName(env.id, 'received_key'))?.importedAt).toEqual(importedAt);

    const edited = await secrets.update(received.id, { valueEnc: VALUE_B, importedAt: null });
    expect(edited.importedAt).toBeNull();

    const untouched = await secrets.update(received.id, { valueEnc: VALUE_A });
    expect(untouched.importedAt).toBeNull();
  });
});

describe('SqliteAuditRepository', () => {
  it('should record events and list them newest-first with count', async () => {
    const db = openInMemoryDatabase();
    const { audit } = createRepositories(db);

    await audit.record('vault.setup', 'uno');
    await audit.record('secret.created', 'dos');
    await audit.record('secret.revealed', 'tres');

    const events = await audit.list(10, 0);
    expect(events.map((e) => e.message)).toEqual(['tres', 'dos', 'uno']);
    expect(events.every((e) => e.createdAt instanceof Date)).toBe(true);
    expect(await audit.count()).toBe(3);

    const paged = await audit.list(1, 1);
    expect(paged.map((e) => e.message)).toEqual(['dos']);
    closeDatabase(db);
  });

  it('should prune events beyond the retention limit', async () => {
    const db = openInMemoryDatabase();
    const { audit } = createRepositories(db);
    for (let i = 1; i <= 10; i++) {
      await audit.record('secret.created', `evento-${i}`);
    }
    await audit.prune(5);
    expect(await audit.count()).toBe(5);
    const remaining = await audit.list(10, 0);
    expect(remaining.map((e) => e.message)).toEqual([
      'evento-10',
      'evento-9',
      'evento-8',
      'evento-7',
      'evento-6',
    ]); // conserva los más recientes
    closeDatabase(db);
  });
});

describe('SqliteProjectRepository', () => {
  it('should start with the default project and count its environments', async () => {
    const db = openInMemoryDatabase();
    const { projects, environments } = createRepositories(db);
    await environments.create(1, 'Local');
    await environments.create(1, 'QA');

    const list = await projects.listWithCounts();

    expect(list.map((p) => [p.name, p.environmentCount])).toEqual([['General', 2]]);
    closeDatabase(db);
  });

  it('should create, find case-insensitively, rename and delete an empty project', async () => {
    const db = openInMemoryDatabase();
    const { projects } = createRepositories(db);

    const created = await projects.create('Tienda');
    expect((await projects.findByName('TIENDA'))?.id).toBe(created.id);
    expect((await projects.findById(created.id))?.name).toBe('Tienda');

    await projects.rename(created.id, 'Tienda online');
    expect((await projects.findById(created.id))?.name).toBe('Tienda online');
    expect(await projects.countEnvironments(created.id)).toBe(0);

    await projects.delete(created.id);
    expect(await projects.findById(created.id)).toBeNull();
    closeDatabase(db);
  });

  it('should not allow two projects with the same name, ignoring case', async () => {
    const db = openInMemoryDatabase();
    const { projects } = createRepositories(db);
    await projects.create('Tienda');
    await expect(projects.create('tienda')).rejects.toThrow();
    closeDatabase(db);
  });

  it('should refuse to delete a project that still has environments', async () => {
    const db = openInMemoryDatabase();
    const { projects, environments } = createRepositories(db);
    const project = await projects.create('Tienda');
    await environments.create(project.id, 'Local');

    await expect(projects.delete(project.id)).rejects.toThrow();
    expect(await projects.countEnvironments(project.id)).toBe(1);
    closeDatabase(db);
  });
});

describe('environments scoped by project', () => {
  it('should allow the same name in different projects and find it per project', async () => {
    const db = openInMemoryDatabase();
    const { projects, environments } = createRepositories(db);
    const shop = await projects.create('Tienda');

    const general = await environments.create(1, 'Local');
    const inShop = await environments.create(shop.id, 'Local');

    expect(general.id).not.toBe(inShop.id);
    expect((await environments.findByName(1, 'local'))?.id).toBe(general.id);
    expect((await environments.findByName(shop.id, 'LOCAL'))?.id).toBe(inShop.id);
    expect(inShop.projectId).toBe(shop.id);
    closeDatabase(db);
  });

  it('should expose the project name on every secret', async () => {
    const db = openInMemoryDatabase();
    const { projects, environments, secrets } = createRepositories(db);
    const shop = await projects.create('Tienda');
    const env = await environments.create(shop.id, 'Local');
    const secret = await secrets.create({
      environmentId: env.id,
      name: 'API_KEY',
      valueEnc: VALUE_A,
      noteEnc: null,
    });

    const loaded = await secrets.findById(secret.id);

    expect(loaded?.projectName).toBe('Tienda');
    expect(loaded?.environmentName).toBe('Local');
    closeDatabase(db);
  });
});
