import type { VaultBackup } from '@secretvault/core';
import type { SqliteDatabase } from './sqlite';

/** Copia completa de la base tal como la ve la conexión (incluye lo confirmado en el WAL). */
export class SqliteVaultBackup implements VaultBackup {
  constructor(private readonly db: SqliteDatabase) {}

  async snapshot(): Promise<Uint8Array> {
    return this.db.serialize();
  }
}
