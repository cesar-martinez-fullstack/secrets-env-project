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
  imported_at: string | null;
  created_at: string;
  updated_at: string;
  environment_name?: string;
  project_name?: string;
}

function toRecord(row: SecretRow): SecretRecord {
  return {
    id: row.id,
    environmentId: row.environment_id,
    name: row.name,
    valueEnc: new Uint8Array(row.value_enc),
    noteEnc: row.note_enc ? new Uint8Array(row.note_enc) : null,
    importedAt: row.imported_at ? new Date(row.imported_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function withMeta(row: SecretRow): SecretWithMeta {
  return {
    ...toRecord(row),
    environmentName: row.environment_name ?? '',
    projectName: row.project_name ?? '',
  };
}

const BASE_SELECT = `
  SELECT s.id, s.environment_id, s.name, s.value_enc, s.note_enc, s.imported_at, s.created_at, s.updated_at,
         e.name AS environment_name, p.name AS project_name
  FROM secrets s
  JOIN environments e ON e.id = s.environment_id
  JOIN projects p ON p.id = e.project_id
`;

interface SecretPatch {
  name?: string;
  valueEnc?: Uint8Array;
  noteEnc?: Uint8Array | null;
  importedAt?: Date | null;
}

type Param = string | number | Uint8Array | null;

function toAssignments(patch: SecretPatch): { sets: string[]; params: Param[] } {
  const sets = ['updated_at = ?'];
  const params: Param[] = [new Date().toISOString()];
  const columns: [string, Param | undefined][] = [
    ['name', patch.name],
    ['value_enc', patch.valueEnc],
    ['note_enc', patch.noteEnc],
    [
      'imported_at',
      patch.importedAt === undefined ? undefined : (patch.importedAt?.toISOString() ?? null),
    ],
  ];
  for (const [column, value] of columns) {
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(value);
  }
  return { sets, params };
}

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
        'SELECT id, environment_id, name, value_enc, note_enc, imported_at, created_at, updated_at FROM secrets WHERE environment_id = ? AND name = ? COLLATE NOCASE',
      )
      .get(environmentId, name);
    return row ? toRecord(row) : null;
  }

  async create(input: {
    environmentId: number;
    name: string;
    valueEnc: Uint8Array;
    noteEnc: Uint8Array | null;
    importedAt?: Date | null;
  }): Promise<SecretRecord> {
    const now = new Date().toISOString();
    const row = this.db
      .query<SecretRow, (string | number | Uint8Array | null)[]>(
        `INSERT INTO secrets (environment_id, name, value_enc, note_enc, imported_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id, environment_id, name, value_enc, note_enc, imported_at, created_at, updated_at`,
      )
      .get(
        input.environmentId,
        input.name,
        input.valueEnc,
        input.noteEnc,
        input.importedAt?.toISOString() ?? null,
        now,
        now,
      );
    return toRecord(row!);
  }

  async update(id: number, patch: SecretPatch): Promise<SecretRecord> {
    const { sets, params } = toAssignments(patch);
    this.db.query(`UPDATE secrets SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    const row = this.db
      .query<SecretRow, [number]>(
        'SELECT id, environment_id, name, value_enc, note_enc, imported_at, created_at, updated_at FROM secrets WHERE id = ?',
      )
      .get(id);
    return toRecord(row!);
  }

  async delete(id: number): Promise<void> {
    this.db.query('DELETE FROM secrets WHERE id = ?').run(id);
  }
}
