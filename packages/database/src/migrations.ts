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
  /**
   * La migración reconstruye una tabla referenciada por otras. Un `DROP TABLE` con claves foráneas
   * activas borraría en cascada a las filas hijas, así que el ejecutor las desactiva mientras
   * dura (procedimiento oficial de SQLite), verifica `foreign_key_check` y las reactiva.
   */
  rebuildsTables?: boolean;
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
  {
    version: 2,
    description: 'cifrado de envoltura: clave de datos envuelta y clave de recuperación',
    // SQLite no permite añadir un CHECK entre columnas con ALTER: se reconstruye la tabla.
    // Las bóvedas existentes quedan en formato 1 y se actualizan al desbloquearlas.
    // COALESCE: un CHECK con NULL se considera cumplido, así que NULL debe contar como 0.
    sql: `
      CREATE TABLE vault_meta_v2 (
        id                   INTEGER PRIMARY KEY CHECK (id = 1),
        salt                 BLOB    NOT NULL CHECK (length(salt) >= 16),
        iterations           INTEGER NOT NULL CHECK (iterations >= 100000),
        verifier             BLOB    NOT NULL CHECK (length(verifier) >= 28),
        format_version       INTEGER NOT NULL DEFAULT 1 CHECK (format_version IN (1, 2)),
        wrapped_dek          BLOB,
        recovery_salt        BLOB,
        recovery_wrapped_dek BLOB,
        created_at           TEXT    NOT NULL,
        updated_at           TEXT    NOT NULL,
        CHECK (
          format_version = 1
          OR (
            COALESCE(length(wrapped_dek), 0) >= 60
            AND COALESCE(length(recovery_salt), 0) >= 16
            AND COALESCE(length(recovery_wrapped_dek), 0) >= 60
          )
        )
      );

      INSERT INTO vault_meta_v2 (id, salt, iterations, verifier, created_at, updated_at)
        SELECT id, salt, iterations, verifier, created_at, updated_at FROM vault_meta;

      DROP TABLE vault_meta;
      ALTER TABLE vault_meta_v2 RENAME TO vault_meta;
    `,
  },
  {
    version: 3,
    description: 'proyectos: los ambientes pertenecen a un proyecto',
    rebuildsTables: true,
    sql: `
      CREATE TABLE projects (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );

      INSERT INTO projects (name, created_at, updated_at) VALUES (
        'General',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );

      CREATE TABLE environments_v3 (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        name       TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL,
        UNIQUE (project_id, name)
      );

      INSERT INTO environments_v3 (id, project_id, name, created_at, updated_at)
        SELECT id, (SELECT id FROM projects WHERE name = 'General'), name, created_at, updated_at
        FROM environments;

      DROP TABLE environments;
      ALTER TABLE environments_v3 RENAME TO environments;
      CREATE INDEX idx_environments_project ON environments(project_id);
    `,
  },
  {
    version: 4,
    description: 'secretos: marca de origen para los recibidos por un archivo compartido',
    sql: 'ALTER TABLE secrets ADD COLUMN imported_at TEXT;',
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

function foreignKeysEnabled(db: Database): boolean {
  return db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()!.foreign_keys === 1;
}

function assertNoForeignKeyViolations(db: Database): void {
  if (db.query('PRAGMA foreign_key_check').all().length > 0) {
    throw new Error('La migración dejó filas que violan claves foráneas; se revierte.');
  }
}

function applyMigration(db: Database, migration: Migration): void {
  const suspendForeignKeys = migration.rebuildsTables === true && foreignKeysEnabled(db);
  // PRAGMA foreign_keys no tiene efecto dentro de una transacción.
  if (suspendForeignKeys) db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(migration.sql);
    if (suspendForeignKeys) assertNoForeignKeyViolations(db);
    db.exec(`PRAGMA user_version = ${migration.version}`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    if (suspendForeignKeys) db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Aplica las migraciones pendientes. Devuelve las versiones aplicadas. */
export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): number[] {
  const from = currentVersion(db);
  assertMigratable(db, from, migrations.at(-1)?.version ?? 0);

  const pending = migrations.filter((m) => m.version > from);
  for (const migration of pending) applyMigration(db, migration);
  return pending.map((m) => m.version);
}
