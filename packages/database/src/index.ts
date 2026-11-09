/**
 * Fábrica de repositorios SQLite — implementan los puertos definidos en `core`.
 */
import type {
  AuditRepository,
  EnvironmentRepository,
  SecretRepository,
  VaultRepository,
} from '@secretvault/core';
import { SqliteAuditRepository } from './repositories/audit-repository';
import { SqliteEnvironmentRepository } from './repositories/environment-repository';
import { SqliteSecretRepository } from './repositories/secret-repository';
import { SqliteVaultRepository } from './repositories/vault-repository';
import type { SqliteDatabase } from './sqlite';

export * from './sqlite';
export * from './migrations';
export { SqliteUnitOfWork } from './unit-of-work';

export interface Repositories {
  vault: VaultRepository;
  environments: EnvironmentRepository;
  secrets: SecretRepository;
  audit: AuditRepository;
}

export function createRepositories(db: SqliteDatabase): Repositories {
  return {
    vault: new SqliteVaultRepository(db),
    environments: new SqliteEnvironmentRepository(db),
    secrets: new SqliteSecretRepository(db),
    audit: new SqliteAuditRepository(db),
  };
}
