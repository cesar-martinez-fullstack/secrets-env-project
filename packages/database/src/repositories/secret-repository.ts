/**
 * Repositorio SQLite de secretos.
 * Los blobs cifrados se almacenan tal cual (BLOB); el repo es agnóstico del cifrado.
 */
import type {
  SecretListFilter,
  SecretRecord,
  SecretRepository,
  SecretWithMeta,
} from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';

interface SecretRow {
  id: number;
  environment_id: number;
  name: string;
  value_enc: Uint8Array;
  note_enc: Uint8Array | null;
  created_at: string;
  updated_at: string;
  environment_name?: string;
}

function toRecord(row: SecretRow): SecretRecord {
  return {
    id: row.id,
    environmentId: row.environment_id,
    name: row.name,
    valueEnc: new Uint8Array(row.value_enc),
    noteEnc: row.note_enc ? new Uint8Array(row.note_enc) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function withMeta(row: SecretRow): SecretWithMeta {
  return { ...toRecord(row), environmentName: row.environment_name ?? '' };
}

const BASE_SELECT = `
  SELECT s.id, s.environment_id, s.name, s.value_enc, s.note_enc, s.created_at, s.updated_at,
         e.name AS environment_name
  FROM secrets s
  JOIN environments e ON e.id = s.environment_id
`;

export class SqliteSecretRepository implements SecretRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async list(filter: SecretListFilter = {}): Promise<SecretWithMeta[]> {
    const conditions: string[] = [];
    const params: (number | string)[] = [];
    if (typeof filter.environmentId === 'number') {
      conditions.push('s.environment_id = ?');
      params.push(filter.environmentId);
    }
    if (typeof filter.query === 'string' && filter.query.length > 0) {
      // Búsqueda por substring, case-insensitive, en tiempo real.
      conditions.push('instr(lower(s.name), lower(?)) > 0');
      params.push(filter.query);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .query<SecretRow, (number | string)[]>(
        `${BASE_SELECT} ${where} ORDER BY s.name COLLATE NOCASE, s.id`,
      )
      .all(...params);
    return rows.map(withMeta);
  }

  async findById(id: number): Promise<SecretWithMeta | null> {
    const row = this.db.query<SecretRow, [number]>(`${BASE_SELECT} WHERE s.id = ?`).get(id);
    return row ? withMeta(row) : null;
  }

  async findByName(environmentId: number, name: string): Promise<SecretRecord | null> {
    const row = this.db
      .query<SecretRow, [number, string]>(
        'SELECT id, environment_id, name, value_enc, note_enc, created_at, updated_at FROM secrets WHERE environment_id = ? AND name = ? COLLATE NOCASE',
      )
      .get(environmentId, name);
    return row ? toRecord(row) : null;
  }

  async create(input: {
    environmentId: number;
    name: string;
    valueEnc: Uint8Array;
    noteEnc: Uint8Array | null;
  }): Promise<SecretRecord> {
    const now = new Date().toISOString();
    const row = this.db
      .query<SecretRow, [number, string, Uint8Array, Uint8Array | null, string, string]>(
        `INSERT INTO secrets (environment_id, name, value_enc, note_enc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, environment_id, name, value_enc, note_enc, created_at, updated_at`,
      )
      .get(input.environmentId, input.name, input.valueEnc, input.noteEnc, now, now);
    return toRecord(row!);
  }

  async update(
    id: number,
    patch: { name?: string; valueEnc?: Uint8Array; noteEnc?: Uint8Array | null },
  ): Promise<SecretRecord> {
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | Uint8Array | null)[] = [new Date().toISOString()];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name);
    }
    if (patch.valueEnc !== undefined) {
      sets.push('value_enc = ?');
      params.push(patch.valueEnc);
    }
    if (patch.noteEnc !== undefined) {
      sets.push('note_enc = ?');
      params.push(patch.noteEnc);
    }
    params.push(id);
    this.db.query(`UPDATE secrets SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    const row = this.db
      .query<SecretRow, [number]>(
        'SELECT id, environment_id, name, value_enc, note_enc, created_at, updated_at FROM secrets WHERE id = ?',
      )
      .get(id);
    return toRecord(row!);
  }

  async delete(id: number): Promise<void> {
    this.db.query('DELETE FROM secrets WHERE id = ?').run(id);
  }
}
