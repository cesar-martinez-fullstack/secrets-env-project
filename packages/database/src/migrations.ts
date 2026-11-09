/**
 * Migraciones de esquema versionadas con `PRAGMA user_version`.
 *
 * - Cada migración corre DENTRO de una transacción (todo o nada) junto con el
 *   incremento de versión: una migración a medias no puede quedar aplicada.
 * - Nunca edites una migración ya publicada: agrega una nueva al final.
 * - Las restricciones (CHECK/UNIQUE/FK) son la última línea de defensa de la
 *   consistencia: la integridad no depende solo de que el código "se porte bien".
 */
import type { Database } from 'bun:sqlite';

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'esquema inicial: bóveda, ambientes, secretos y auditoría',
    sql: `
      CREATE TABLE vault_meta (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        salt        BLOB    NOT NULL CHECK (length(salt) >= 16),
        iterations  INTEGER NOT NULL CHECK (iterations >= 100000),
        verifier    BLOB    NOT NULL CHECK (length(verifier) >= 28),
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE TABLE environments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );

      CREATE TABLE secrets (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        name           TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
        value_enc      BLOB    NOT NULL CHECK (length(value_enc) >= 28),
        note_enc       BLOB    CHECK (note_enc IS NULL OR length(note_enc) >= 28),
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        UNIQUE (environment_id, name)
      );

      CREATE INDEX idx_secrets_env  ON secrets(environment_id);
      CREATE INDEX idx_secrets_name ON secrets(name COLLATE NOCASE);

      CREATE TABLE audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT NOT NULL,
        message    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_audit_created ON audit_log(created_at);
    `,
  },
];

export class SchemaTooNewError extends Error {
  constructor(found: number, supported: number) {
    super(
      `La base de datos tiene el esquema v${found}, pero esta versión solo soporta hasta v${supported}. ` +
        'Actualiza SecretVault; no se modificó nada.',
    );
    this.name = 'SchemaTooNewError';
  }
}

export function currentVersion(db: Database): number {
  return db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
}

/** Aplica las migraciones pendientes. Devuelve las versiones aplicadas. */
export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): number[] {
  const latest = migrations.at(-1)?.version ?? 0;
  const from = currentVersion(db);
  if (from > latest) throw new SchemaTooNewError(from, latest);

  const applied: number[] = [];
  for (const migration of migrations.filter((m) => m.version > from)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      applied.push(migration.version);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return applied;
}
