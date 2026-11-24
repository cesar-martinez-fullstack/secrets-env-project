/**
 * Repositorio SQLite de ambientes.
 */
import type { Environment, EnvironmentRepository, EnvironmentWithCount } from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';

interface EnvRow {
  id: number;
  project_id: number;
  name: string;
  created_at: string;
  updated_at: string;
  secret_count?: number;
}

function toEnvironment(row: EnvRow): Environment {
  return {
    id: row.id,
    projectId: row.project_id,
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
        'SELECT id, project_id, name, created_at, updated_at FROM environments ORDER BY project_id, created_at, id',
      )
      .all();
    return rows.map(toEnvironment);
  }

  async listWithCounts(): Promise<EnvironmentWithCount[]> {
    const rows = this.db
      .query<EnvRow, []>(
        `SELECT e.id, e.project_id, e.name, e.created_at, e.updated_at,
                (SELECT COUNT(*) FROM secrets s WHERE s.environment_id = e.id) AS secret_count
         FROM environments e
         ORDER BY e.project_id, e.created_at, e.id`,
      )
      .all();
    return rows.map((row) => ({ ...toEnvironment(row), secretCount: row.secret_count ?? 0 }));
  }

  async findById(id: number): Promise<Environment | null> {
    const row = this.db
      .query<EnvRow, [number]>(
        'SELECT id, project_id, name, created_at, updated_at FROM environments WHERE id = ?',
      )
      .get(id);
    return row ? toEnvironment(row) : null;
  }

  async findByName(projectId: number, name: string): Promise<Environment | null> {
    const row = this.db
      .query<EnvRow, [number, string]>(
        `SELECT id, project_id, name, created_at, updated_at FROM environments
         WHERE project_id = ? AND name = ? COLLATE NOCASE`,
      )
      .get(projectId, name.trim());
    return row ? toEnvironment(row) : null;
  }

  async create(projectId: number, name: string): Promise<Environment> {
    const now = new Date().toISOString();
    const row = this.db
      .query<EnvRow, [number, string, string, string]>(
        `INSERT INTO environments (project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
         RETURNING id, project_id, name, created_at, updated_at`,
      )
      .get(projectId, name, now, now);
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
