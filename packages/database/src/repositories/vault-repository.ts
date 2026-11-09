/**
 * Repositorio SQLite de la bóveda (fila única id=1).
 */
import type { VaultInfo, VaultRepository } from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';

interface VaultRow {
  salt: Uint8Array;
  iterations: number;
  verifier: Uint8Array;
  created_at: string;
  updated_at: string;
}

export class SqliteVaultRepository implements VaultRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(): Promise<VaultInfo | null> {
    const row = this.db
      .query<VaultRow, []>(
        'SELECT salt, iterations, verifier, created_at, updated_at FROM vault_meta WHERE id = 1',
      )
      .get();
    if (!row) return null;
    return {
      salt: new Uint8Array(row.salt),
      iterations: row.iterations,
      verifier: new Uint8Array(row.verifier),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async save(info: VaultInfo): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO vault_meta (id, salt, iterations, verifier, created_at, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           salt = ?1, iterations = ?2, verifier = ?3, updated_at = ?5`,
      )
      .run(info.salt, info.iterations, info.verifier, info.createdAt.toISOString(), now);
  }
}
