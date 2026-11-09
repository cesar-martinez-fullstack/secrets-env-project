/**
 * Repositorio SQLite de ambientes.
 */
import type { Environment, EnvironmentRepository, EnvironmentWithCount } from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';

interface EnvRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  secret_count?: number;
}

function toEnvironment(row: EnvRow): Environment {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SqliteEnvironmentRepository implements EnvironmentRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async list(): Promise<Environment[]> {
    const rows = this.db
      .query<EnvRow, []>(
        'SELECT id, name, created_at, updated_at FROM environments ORDER BY created_at, id',
      )
      .all();
    return rows.map(toEnvironment);
  }

  async listWithCounts(): Promise<EnvironmentWithCount[]> {
    const rows = this.db
      .query<EnvRow, []>(
        `SELECT e.id, e.name, e.created_at, e.updated_at,
                (SELECT COUNT(*) FROM secrets s WHERE s.environment_id = e.id) AS secret_count
         FROM environments e
         ORDER BY e.created_at, e.id`,
      )
      .all();
    return rows.map((row) => ({ ...toEnvironment(row), secretCount: row.secret_count ?? 0 }));
  }

  async findById(id: number): Promise<Environment | null> {
    const row = this.db
      .query<EnvRow, [number]>(
        'SELECT id, name, created_at, updated_at FROM environments WHERE id = ?',
      )
      .get(id);
    return row ? toEnvironment(row) : null;
  }

  async findByName(name: string): Promise<Environment | null> {
    const row = this.db
      .query<EnvRow, [string]>(
        'SELECT id, name, created_at, updated_at FROM environments WHERE name = ? COLLATE NOCASE',
      )
      .get(name.trim());
    return row ? toEnvironment(row) : null;
  }

  async create(name: string): Promise<Environment> {
    const now = new Date().toISOString();
    const row = this.db
      .query<EnvRow, [string, string, string]>(
        `INSERT INTO environments (name, created_at, updated_at) VALUES (?, ?, ?)
         RETURNING id, name, created_at, updated_at`,
      )
      .get(name, now, now);
    return toEnvironment(row!);
  }

  async rename(id: number, name: string): Promise<void> {
    this.db
      .query('UPDATE environments SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, new Date().toISOString(), id);
  }

  async delete(id: number): Promise<void> {
    this.db.query('DELETE FROM environments WHERE id = ?').run(id);
  }
}
