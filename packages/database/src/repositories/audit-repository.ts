/**
 * Repositorio SQLite de auditoría. Registra eventos y poda los más antiguos
 * por encima del máximo retenido.
 */
import type { AuditRepository } from '@secretvault/core';
import type { AuditEvent } from '@secretvault/core';
import type { AuditEventType } from '@secretvault/shared';
import { AUDIT_MAX_EVENTS } from '@secretvault/shared';
import type { SqliteDatabase } from '../sqlite';

interface AuditRow {
  id: number;
  type: string;
  message: string;
  created_at: string;
}

export class SqliteAuditRepository implements AuditRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async record(type: AuditEventType, message: string): Promise<void> {
    this.db
      .query('INSERT INTO audit_log (type, message, created_at) VALUES (?, ?, ?)')
      .run(type, message, new Date().toISOString());
    await this.prune(this.retention());
  }

  /** La retención vive en la misma base (tabla `security_settings`). */
  private retention(): number {
    const row = this.db
      .query<{ audit_max_events: number }, []>(
        'SELECT audit_max_events FROM security_settings WHERE id = 1',
      )
      .get();
    return row?.audit_max_events ?? AUDIT_MAX_EVENTS;
  }

  async list(limit: number, offset: number): Promise<AuditEvent[]> {
    const rows = this.db
      .query<AuditRow, [number, number]>(
        'SELECT id, type, message, created_at FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?',
      )
      .all(limit, offset);
    return rows.map((row) => ({
      id: row.id,
      type: row.type as AuditEventType,
      message: row.message,
      createdAt: new Date(row.created_at),
    }));
  }

  async count(): Promise<number> {
    const row = this.db
      .query<{ total: number }, []>('SELECT COUNT(*) AS total FROM audit_log')
      .get();
    return row?.total ?? 0;
  }

  async clear(): Promise<number> {
    return this.db.query('DELETE FROM audit_log').run().changes;
  }

  async prune(max: number): Promise<void> {
    this.db
      .query(
        'DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT ?)',
      )
      .run(max);
  }
}
