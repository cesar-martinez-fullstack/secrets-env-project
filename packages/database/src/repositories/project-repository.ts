import type { Project, ProjectRepository, ProjectWithCount } from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';

interface ProjectRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  environment_count?: number;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async listWithCounts(): Promise<ProjectWithCount[]> {
    const rows = this.db
      .query<ProjectRow, []>(
        `SELECT p.id, p.name, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM environments e WHERE e.project_id = p.id) AS environment_count
         FROM projects p
         ORDER BY p.created_at, p.id`,
      )
      .all();
    return rows.map((row) => ({ ...toProject(row), environmentCount: row.environment_count ?? 0 }));
  }

  async findById(id: number): Promise<Project | null> {
    const row = this.db
      .query<ProjectRow, [number]>(
        'SELECT id, name, created_at, updated_at FROM projects WHERE id = ?',
      )
      .get(id);
    return row ? toProject(row) : null;
  }

  async findByName(name: string): Promise<Project | null> {
    const row = this.db
      .query<ProjectRow, [string]>(
        'SELECT id, name, created_at, updated_at FROM projects WHERE name = ? COLLATE NOCASE',
      )
      .get(name.trim());
    return row ? toProject(row) : null;
  }

  async create(name: string): Promise<Project> {
    const now = new Date().toISOString();
    const row = this.db
      .query<ProjectRow, [string, string, string]>(
        `INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)
         RETURNING id, name, created_at, updated_at`,
      )
      .get(name, now, now);
    return toProject(row!);
  }

  async rename(id: number, name: string): Promise<void> {
    this.db
      .query('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, new Date().toISOString(), id);
  }

  async delete(id: number): Promise<void> {
    this.db.query('DELETE FROM projects WHERE id = ?').run(id);
  }

  async countEnvironments(id: number): Promise<number> {
    const row = this.db
      .query<{ total: number }, [number]>(
        'SELECT COUNT(*) AS total FROM environments WHERE project_id = ?',
      )
      .get(id);
    return row?.total ?? 0;
  }
}
