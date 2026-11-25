import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { currentVersion, migrate, MIGRATIONS } from '../src';
import { SqliteAuditRepository } from '../src/repositories/audit-repository';
import { SqliteSecuritySettingsRepository } from '../src/repositories/security-settings-repository';

describe('audit retention (migration 6 and repositories)', () => {
  let db: Database;
  let audit: SqliteAuditRepository;
  let security: SqliteSecuritySettingsRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    audit = new SqliteAuditRepository(db);
    security = new SqliteSecuritySettingsRepository(db);
  });

  afterEach(() => db.close());

  it('should create the settings row with the default retention of 1000 events', async () => {
    expect(currentVersion(db)).toBe(MIGRATIONS.at(-1)!.version);
    expect(await security.get()).toEqual({ auditMaxEvents: 1_000 });
  });

  it('should keep the settings table to a single row with a valid retention', () => {
    expect(() => db.query('INSERT INTO security_settings (id) VALUES (2)').run()).toThrow();
    for (const invalid of [99, 100_001, 0, -1]) {
      expect(() =>
        db.query('UPDATE security_settings SET audit_max_events = ? WHERE id = 1').run(invalid),
      ).toThrow();
    }
  });

  it('should save and read back the retention', async () => {
    await security.save({ auditMaxEvents: 5_000 });

    expect(await security.get()).toEqual({ auditMaxEvents: 5_000 });
  });

  it('should prune the oldest events beyond the configured retention each time one is recorded', async () => {
    await security.save({ auditMaxEvents: 100 });

    for (let index = 1; index <= 130; index++) await audit.record('vault.lock', `evento ${index}`);

    expect(await audit.count()).toBe(100);
    const [newest] = await audit.list(1, 0);
    const [oldest] = await audit.list(1, 99);
    expect(newest?.message).toBe('evento 130');
    expect(oldest?.message).toBe('evento 31');
  });

  it('should prune at once when the retention is lowered', async () => {
    for (let index = 1; index <= 150; index++) await audit.record('vault.lock', `evento ${index}`);
    await security.save({ auditMaxEvents: 100 });

    await audit.prune(100);

    expect(await audit.count()).toBe(100);
  });

  const countOf = (type: string) =>
    db
      .query<{ total: number }, [string]>('SELECT COUNT(*) AS total FROM audit_log WHERE type = ?')
      .get(type)!.total;

  it('should keep the proof of a clearing however many other events arrive afterwards', async () => {
    await security.save({ auditMaxEvents: 100 });
    await audit.record('audit.cleared', 'vaciado');

    for (let index = 0; index < 300; index++) await audit.record('secret.revealed', 'revelado');
    for (let index = 0; index < 300; index++) await audit.record('vault.recovery_failed', 'fallo');

    expect(countOf('audit.cleared')).toBe(1);
  });

  it('should cap failed attempts apart, so they never push out ordinary events', async () => {
    await security.save({ auditMaxEvents: 100 });
    for (let index = 0; index < 100; index++) await audit.record('secret.exported', 'export');

    for (let index = 0; index < 150; index++) await audit.record('vault.unlock_failed', 'fallo');
    for (let index = 0; index < 150; index++) await audit.record('vault.recovery_failed', 'fallo');

    expect(countOf('secret.exported')).toBe(100);
    expect(countOf('vault.unlock_failed') + countOf('vault.recovery_failed')).toBe(200);
  });

  it('should cap the history changes at their own quota', async () => {
    for (let index = 0; index < 120; index++) {
      await audit.record('audit.retention_changed', 'cambio');
    }

    expect(countOf('audit.retention_changed')).toBe(100);
  });

  it('should clear the whole history and report how many events it removed', async () => {
    for (let index = 1; index <= 12; index++) await audit.record('vault.lock', `evento ${index}`);

    expect(await audit.clear()).toBe(12);
    expect(await audit.count()).toBe(0);
    expect(await audit.clear()).toBe(0);
  });
});
