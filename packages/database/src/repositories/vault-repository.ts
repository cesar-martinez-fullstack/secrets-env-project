/**
 * Repositorio SQLite de la bóveda (fila única id=1).
 * Los blobs (verificador, DEK envuelta) son opacos para este repositorio.
 */
import type { VaultInfo, VaultRepository } from '@secretvault/core';
import type { SqliteDatabase } from '../sqlite';

interface VaultRow {
  salt: Uint8Array;
  iterations: number;
  verifier: Uint8Array;
  format_version: 1 | 2;
  wrapped_dek: Uint8Array | null;
  recovery_salt: Uint8Array | null;
  recovery_wrapped_dek: Uint8Array | null;
  created_at: string;
  updated_at: string;
}

const bytesOrNull = (value: Uint8Array | null): Uint8Array | null =>
  value ? new Uint8Array(value) : null;

export class SqliteVaultRepository implements VaultRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(): Promise<VaultInfo | null> {
    const row = this.db
      .query<VaultRow, []>(
        `SELECT salt, iterations, verifier, format_version, wrapped_dek, recovery_salt,
                recovery_wrapped_dek, created_at, updated_at
         FROM vault_meta WHERE id = 1`,
      )
      .get();
    if (!row) return null;
    return {
      salt: new Uint8Array(row.salt),
      iterations: row.iterations,
      verifier: new Uint8Array(row.verifier),
      formatVersion: row.format_version,
      wrappedDek: bytesOrNull(row.wrapped_dek),
      recoverySalt: bytesOrNull(row.recovery_salt),
      recoveryWrappedDek: bytesOrNull(row.recovery_wrapped_dek),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async save(info: VaultInfo): Promise<void> {
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO vault_meta
           (id, salt, iterations, verifier, format_version, wrapped_dek, recovery_salt,
            recovery_wrapped_dek, created_at, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           salt = ?1, iterations = ?2, verifier = ?3, format_version = ?4, wrapped_dek = ?5,
           recovery_salt = ?6, recovery_wrapped_dek = ?7, updated_at = ?9`,
      )
      .run(
        info.salt,
        info.iterations,
        info.verifier,
        info.formatVersion,
        info.wrappedDek,
        info.recoverySalt,
        info.recoveryWrappedDek,
        info.createdAt.toISOString(),
        now,
      );
  }
}
