/**
 * Entidades de dominio de SecretVault.
 * Este paquete NO conoce HTTP, Bun, Vue ni SQLite: solo reglas de negocio puras.
 */
import type { AuditEventType } from '@secretvault/shared';

/** Registro único de la bóveda (fila id=1 en la base de datos). */
export interface VaultInfo {
  salt: Uint8Array;
  iterations: number;
  /** Blob AES-256-GCM de un texto verificador conocido, cifrado con la clave de datos. */
  verifier: Uint8Array;
  createdAt: Date;
  updatedAt: Date;
  /**
   * 1 = formato inicial (la clave derivada de la contraseña cifra los secretos directamente).
   * 2 = cifrado de envoltura: una clave de datos (DEK) aleatoria cifra los secretos y se guarda
   *     envuelta dos veces (contraseña y clave de recuperación).
   */
  formatVersion: 1 | 2;
  /** DEK envuelta con la KEK de la contraseña maestra (solo formato 2). */
  wrappedDek: Uint8Array | null;
  /** Sal del HKDF de la clave de recuperación (solo formato 2). */
  recoverySalt: Uint8Array | null;
  /** DEK envuelta con la KEK de la clave de recuperación (solo formato 2). */
  recoveryWrappedDek: Uint8Array | null;
}

export interface Project {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithCount extends Project {
  environmentCount: number;
}

export interface Environment {
  id: number;
  projectId: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnvironmentWithCount extends Environment {
  secretCount: number;
}

/** Secreto persistido: el valor y la nota viajan cifrados (AES-256-GCM). */
export interface SecretRecord {
  id: number;
  environmentId: number;
  name: string;
  valueEnc: Uint8Array;
  noteEnc: Uint8Array | null;
  importedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretWithMeta extends SecretRecord {
  environmentName: string;
  projectName: string;
}

/** Modelo de lectura para listados: valor SIEMPRE enmascarado. */
export interface SecretSummary {
  id: number;
  environmentId: number;
  environmentName: string;
  projectName: string;
  name: string;
  maskedValue: string;
  hasNote: boolean;
  importedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Secreto desencriptado bajo demanda (reveal). */
export interface DecryptedSecret {
  id: number;
  environmentId: number;
  environmentName: string;
  name: string;
  value: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEvent {
  id: number;
  type: AuditEventType;
  message: string;
  createdAt: Date;
}

/** Entrada desencriptada lista para formatear en la exportación. */
export interface ExportEntry {
  name: string;
  value: string;
  note: string | null;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  invalidLines: number;
}

/** Sesión activa: la clave vive SOLO en RAM, ligada a un token opaco. */
export interface VaultSession {
  sessionId: string;
  key: Uint8Array;
  expiresAt: Date;
  createdAt: Date;
}

export interface ShareFile {
  content: string;
  projectName: string;
  environmentName: string | null;
}

export interface SharePreviewEnvironment {
  name: string;
  secretCount: number;
  exists: boolean;
  conflicts: string[];
}

export interface SharePreview {
  projectName: string;
  environments: SharePreviewEnvironment[];
  secretCount: number;
}

export interface ShareImportPlan {
  passphrase: string;
  projectId: number | null;
  separateEnvironments: string[];
  overwrite: boolean;
}

export interface ShareImportResult {
  projectId: number;
  projectName: string;
  environmentCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
}
