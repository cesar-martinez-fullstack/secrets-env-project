/**
 * Contratos de repositorios (puertos de persistencia).
 * La implementación vive en `@secretvault/database` (SQLite + bun:sqlite).
 */
import type {
  AuditEvent,
  Environment,
  EnvironmentWithCount,
  InstanceSettings,
  Project,
  ProjectWithCount,
  SecretRecord,
  SecretWithMeta,
  SecuritySettings,
  VaultInfo,
} from '../domain/entities';
import type { AuditEventType } from '@secretvault/shared';

export interface VaultRepository {
  get(): Promise<VaultInfo | null>;
  /** Upsert de la fila única de la bóveda. */
  save(info: VaultInfo): Promise<void>;
}

export interface ProjectRepository {
  listWithCounts(): Promise<ProjectWithCount[]>;
  findById(id: number): Promise<Project | null>;
  /** Búsqueda case-insensitive del nombre exacto. */
  findByName(name: string): Promise<Project | null>;
  create(name: string): Promise<Project>;
  rename(id: number, name: string): Promise<void>;
  delete(id: number): Promise<void>;
  countEnvironments(id: number): Promise<number>;
}

export interface EnvironmentRepository {
  list(): Promise<Environment[]>;
  listWithCounts(): Promise<EnvironmentWithCount[]>;
  findById(id: number): Promise<Environment | null>;
  /** Búsqueda case-insensitive del nombre exacto dentro de un proyecto. */
  findByName(projectId: number, name: string): Promise<Environment | null>;
  create(projectId: number, name: string): Promise<Environment>;
  rename(id: number, name: string): Promise<void>;
  delete(id: number): Promise<void>;
}

export interface SecretListFilter {
  environmentId?: number;
  /** Búsqueda por nombre (substring, case-insensitive, en tiempo real). */
  query?: string;
}

export interface SecretRepository {
  list(filter?: SecretListFilter): Promise<SecretWithMeta[]>;
  findById(id: number): Promise<SecretWithMeta | null>;
  findByName(environmentId: number, name: string): Promise<SecretRecord | null>;
  create(input: {
    environmentId: number;
    name: string;
    valueEnc: Uint8Array;
    noteEnc: Uint8Array | null;
    importedAt?: Date | null;
  }): Promise<SecretRecord>;
  update(
    id: number,
    patch: {
      name?: string;
      valueEnc?: Uint8Array;
      noteEnc?: Uint8Array | null;
      importedAt?: Date | null;
    },
  ): Promise<SecretRecord>;
  /** Fija el orden manual: `orderedIds[i]` queda en la posición `i` del ambiente. */
  setPositions(environmentId: number, orderedIds: readonly number[]): Promise<void>;
  delete(id: number): Promise<void>;
}

export interface AuditRepository {
  record(type: AuditEventType, message: string): Promise<void>;
  list(limit: number, offset: number): Promise<AuditEvent[]>;
  count(): Promise<number>;
  /** Podar eventos antiguos más allá del máximo retenido. */
  prune(max: number): Promise<void>;
  /** Borra todo el historial y devuelve cuántos eventos eliminó. */
  clear(): Promise<number>;
}

/** Ajustes de seguridad que viven dentro de la base (y por tanto en las copias). */
export interface SecuritySettingsRepository {
  get(): Promise<SecuritySettings>;
  save(settings: SecuritySettings): Promise<void>;
}

/** Ajustes de la instancia: viven fuera de la bóveda y se leen antes de desbloquearla. */
export interface SettingsRepository {
  /** Devuelve los valores por defecto si todavía no hay nada guardado. */
  load(): Promise<InstanceSettings>;
  save(settings: InstanceSettings): Promise<void>;
}
