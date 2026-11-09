/**
 * Motor de datos: SQLite local en un solo archivo (secrets.db) vía bun:sqlite.
 * El esquema evoluciona con migraciones versionadas (ver migrations.ts).
 */
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { migrate } from './migrations';

export type SqliteDatabase = Database;

export interface OpenDatabaseResult {
  db: SqliteDatabase;
  filePath: string;
}

/**
 * PRAGMAs de integridad y durabilidad (ACID):
 * - foreign_keys=ON   -> integridad referencial (SQLite la trae desactivada).
 * - journal_mode=WAL  -> lectores no bloquean al escritor; recuperacion tras caida.
 * - synchronous=FULL  -> Durabilidad: un COMMIT sobrevive a un corte de energia.
 * - secure_delete=ON  -> los bytes borrados se sobrescriben (no quedan restos).
 * - busy_timeout      -> espera en vez de fallar si el archivo esta momentaneamente bloqueado.
 */
function applyPragmas(db: SqliteDatabase): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec('PRAGMA secure_delete = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA trusted_schema = OFF;');
}

/** Falla temprano si el archivo esta corrupto, en vez de descubrirlo al leer un secreto. */
function assertIntegrity(db: SqliteDatabase): void {
  const rows = db.query<{ quick_check: string }, []>('PRAGMA quick_check').all();
  if (rows.length !== 1 || rows[0]!.quick_check !== 'ok') {
    throw new Error('La base de datos fallo la verificacion de integridad (PRAGMA quick_check).');
  }
}

/** Permisos restrictivos (solo el dueno). Best-effort: no aplica en Windows. */
function restrictPermissions(dataDir: string, filePath: string): void {
  try {
    chmodSync(dataDir, 0o700);
    chmodSync(filePath, 0o600);
  } catch {
    // Sistemas de archivos sin permisos POSIX (Windows, algunos volumenes montados).
  }
}

/** Abre (o crea) la base de datos en `dataDir/secrets.db` y aplica las migraciones. */
export function openDatabase(dataDir: string): OpenDatabaseResult {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filePath = join(dataDir, 'secrets.db');
  const db = new Database(filePath, { create: true });

  applyPragmas(db);
  assertIntegrity(db);
  migrate(db);
  restrictPermissions(dataDir, filePath);

  return { db, filePath };
}

/** Base de datos en memoria para tests de repositorios. */
export function openInMemoryDatabase(): SqliteDatabase {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/** Cierra limpiamente la base de datos (checkpoint de WAL incluido). */
export function closeDatabase(db: SqliteDatabase): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.close();
}
