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
import type { SortOrder } from '@secretvault/shared';
import type { SqliteDatabase } from '../sqlite';

interface SecretRow {
  id: number;
  environment_id: number;
  name: string;
  value_enc: Uint8Array;
  note_enc: Uint8Array | null;
  imported_at: string | null;
  position: number;
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
    position: row.position,
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
  SELECT s.id, s.environment_id, s.name, s.value_enc, s.note_enc, s.imported_at, s.position, s.created_at, s.updated_at,
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

// El texto de ORDER BY sale de esta lista cerrada, nunca de la petición.
const ORDER_BY: Record<SortOrder, string> = {
  asc: 's.name COLLATE NOCASE, s.id',
  desc: 's.name COLLATE NOCASE DESC, s.id',
  manual: 's.position, s.id',
};

function toWhere(filter: SecretListFilter): { where: string; params: (number | string)[] } {
  const conditions: string[] = [];
  const params: (number | string)[] = [];
  if (typeof filter.environmentId === 'number') {
    conditions.push('s.environment_id = ?');
    params.push(filter.environmentId);
  }
  if (typeof filter.query === 'string' && filter.query.length > 0) {
    conditions.push('instr(lower(s.name), lower(?)) > 0');
    params.push(filter.query);
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export class SqliteSecretRepository implements SecretRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async list(filter: SecretListFilter = {}): Promise<SecretWithMeta[]> {
    const { where, params } = toWhere(filter);
    const paged = filter.limit !== undefined;
    const rows = this.db
      .query<SecretRow, (number | string)[]>(
        `${BASE_SELECT} ${where} ORDER BY ${ORDER_BY[filter.order ?? 'asc']}${paged ? ' LIMIT ? OFFSET ?' : ''}`,
      )
      .all(...params, ...(paged ? [filter.limit!, filter.offset ?? 0] : []));
    return rows.map(withMeta);
  }

  async count(filter: SecretListFilter = {}): Promise<number> {
    const { where, params } = toWhere(filter);
    return this.db
      .query<{ total: number }, (number | string)[]>(
        `SELECT COUNT(*) AS total FROM secrets s ${where}`,
      )
      .get(...params)!.total;
  }

  async findById(id: number): Promise<SecretWithMeta | null> {
    const row = this.db.query<SecretRow, [number]>(`${BASE_SELECT} WHERE s.id = ?`).get(id);
    return row ? withMeta(row) : null;
  }

  async findByName(environmentId: number, name: string): Promise<SecretRecord | null> {
    const row = this.db
      .query<SecretRow, [number, string]>(
        'SELECT id, environment_id, name, value_enc, note_enc, imported_at, position, created_at, updated_at FROM secrets WHERE environment_id = ? AND name = ? COLLATE NOCASE',
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
        `INSERT INTO secrets (environment_id, name, value_enc, note_enc, imported_at, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM secrets WHERE environment_id = ?), ?, ?)
         RETURNING id, environment_id, name, value_enc, note_enc, imported_at, position, created_at, updated_at`,
      )
      .get(
        input.environmentId,
        input.name,
        input.valueEnc,
        input.noteEnc,
        input.importedAt?.toISOString() ?? null,
        input.environmentId,
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
        'SELECT id, environment_id, name, value_enc, note_enc, imported_at, position, created_at, updated_at FROM secrets WHERE id = ?',
      )
      .get(id);
    return toRecord(row!);
  }

  async setPositions(environmentId: number, orderedIds: readonly number[]): Promise<void> {
    const statement = this.db.query(
      'UPDATE secrets SET position = ? WHERE id = ? AND environment_id = ?',
    );
    orderedIds.forEach((id, position) => statement.run(position, id, environmentId));
  }

  async delete(id: number): Promise<void> {
    this.db.query('DELETE FROM secrets WHERE id = ?').run(id);
  }
}
