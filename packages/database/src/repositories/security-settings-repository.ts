import type { SecuritySettings, SecuritySettingsRepository } from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';
import type { LogLevel } from '@secretvault/shared';

interface SecurityRow {
  audit_max_events: number;
  auto_lock_minutes: number | null;
  session_max_minutes: number | null;
  clipboard_clear_seconds: number;
  log_level: LogLevel | null;
}

/** Ajustes de seguridad dentro de la base (una sola fila): viajan con las copias y con el cifrado en reposo. */
export class SqliteSecuritySettingsRepository implements SecuritySettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(): Promise<SecuritySettings> {
    const row = this.db
      .query<SecurityRow, []>(
        `SELECT audit_max_events, auto_lock_minutes, session_max_minutes, clipboard_clear_seconds,
           log_level
         FROM security_settings WHERE id = 1`,
      )
      .get();
    if (!row) throw new Error('Falta la fila de ajustes de seguridad.');
    return {
      auditMaxEvents: row.audit_max_events,
      autoLockMinutes: row.auto_lock_minutes,
      sessionMaxMinutes: row.session_max_minutes,
      clipboardClearSeconds: row.clipboard_clear_seconds,
      logLevel: row.log_level,
    };
  }

  async save(settings: SecuritySettings): Promise<void> {
    this.db
      .query(
        `UPDATE security_settings SET audit_max_events = ?, auto_lock_minutes = ?,
           session_max_minutes = ?, clipboard_clear_seconds = ?, log_level = ? WHERE id = 1`,
      )
      .run(
        settings.auditMaxEvents,
        settings.autoLockMinutes,
        settings.sessionMaxMinutes,
        settings.clipboardClearSeconds,
        settings.logLevel,
      );
  }
}
