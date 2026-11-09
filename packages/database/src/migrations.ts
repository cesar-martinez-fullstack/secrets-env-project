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

/**
 * Base de datos creada antes de existir las migraciones (esquema sin versionar y formato
 * cifrado anterior). No se puede migrar: se rechaza con un mensaje accionable.
 */
export class LegacyDatabaseError extends Error {
  constructor() {
    super(
      'La base de datos fue creada por una versión anterior a v0.1.0 (sin migraciones) y su ' +
        'formato cifrado ya no es compatible. Muévela o bórrala (carpeta SV_DATA_DIR) para crear ' +
        'una bóveda nueva; no se modificó nada.',
    );
    this.name = 'LegacyDatabaseError';
  }
}

function hasTable(db: Database, name: string): boolean {
  return (
    db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) != null
  );
}

export function currentVersion(db: Database): number {
  return db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
}

/** Rechaza (sin tocar nada) bases que esta versión no puede ni debe migrar. */
function assertMigratable(db: Database, from: number, latest: number): void {
  if (from > latest) throw new SchemaTooNewError(from, latest);
  if (from === 0 && hasTable(db, 'vault_meta')) throw new LegacyDatabaseError();
}

/** Aplica las migraciones pendientes. Devuelve las versiones aplicadas. */
export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): number[] {
  const from = currentVersion(db);
  assertMigratable(db, from, migrations.at(-1)?.version ?? 0);

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
