import type { SecuritySettings, SecuritySettingsRepository } from '@secretvault/core';
import { AUDIT_MAX_EVENTS } from '@secretvault/shared';
import type { SqliteDatabase } from '../sqlite';

/** Ajustes de seguridad dentro de la base (una sola fila): viajan con las copias y con el cifrado en reposo. */
export class SqliteSecuritySettingsRepository implements SecuritySettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(): Promise<SecuritySettings> {
    const row = this.db
      .query<{ audit_max_events: number }, []>(
        'SELECT audit_max_events FROM security_settings WHERE id = 1',
      )
      .get();
    return { auditMaxEvents: row?.audit_max_events ?? AUDIT_MAX_EVENTS };
  }

  async save(settings: SecuritySettings): Promise<void> {
    this.db
      .query('UPDATE security_settings SET audit_max_events = ? WHERE id = 1')
      .run(settings.auditMaxEvents);
  }
}
