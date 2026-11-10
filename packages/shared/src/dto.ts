/**
 * DTOs del protocolo HTTP. Las fechas viajan como ISO-8601 (string).
 * Los valores de secretos NUNCA viajan en estos DTOs salvo en la respuesta
 * explícita de "reveal" (y en los archivos de exportación, bajo demanda).
 */
import type { AuditEventType, ExportFormat } from './constants';

export interface ApiErrorBody {
  error: { code: string; message: string; issues?: { field: string; message: string }[] };
}

export interface VaultStatusDto {
  initialized: boolean;
  /** `true` si la bóveda admite recuperación con clave de recuperación. */
  recoveryAvailable: boolean;
  unlocked: boolean;
  autoLockMinutes: number;
  pbkdf2Iterations: number;
}

export interface SetupVaultRequestDto {
  masterPassword: string;
}

export interface UnlockVaultRequestDto {
  masterPassword: string;
}

export interface ChangeMasterPasswordRequestDto {
  currentPassword: string;
  newPassword: string;
}

export interface OkDto {
  ok: true;
}

/**
 * La clave de recuperación se muestra UNA sola vez (setup, recuperación, actualización de una
 * bóveda anterior o regeneración): el servidor no la guarda y no puede volver a mostrarla.
 */
export interface SetupVaultResponseDto {
  ok: true;
  recoveryKey: string;
}

export interface UnlockVaultResponseDto {
  ok: true;
  /** Solo presente cuando una bóveda anterior se actualizó al formato con clave de recuperación. */
  recoveryKey?: string;
}

export interface RecoverVaultRequestDto {
  recoveryKey: string;
  newPassword: string;
}

/** Tras recuperar el acceso la clave usada se reemplaza: esta es la NUEVA clave de recuperación. */
export interface RecoverVaultResponseDto {
  ok: true;
  recoveryKey: string;
}

export interface RegenerateRecoveryKeyRequestDto {
  currentPassword: string;
}

export interface RecoveryKeyDto {
  recoveryKey: string;
}

export interface ProjectDto {
  id: number;
  name: string;
  environmentCount: number;
  createdAt: string;
}

export interface CreateProjectRequestDto {
  name: string;
}

export interface RenameProjectRequestDto {
  name: string;
}

export interface EnvironmentDto {
  id: number;
  projectId: number;
  name: string;
  secretCount: number;
  createdAt: string;
}

export interface CreateEnvironmentRequestDto {
  projectId: number;
  name: string;
}

export interface RenameEnvironmentRequestDto {
  name: string;
}

export interface SecretDto {
  id: number;
  environmentId: number;
  environmentName: string;
  projectName: string;
  name: string;
  maskedValue: string;
  hasNote: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSecretRequestDto {
  environmentId: number;
  name: string;
  value: string;
  note?: string | null;
}

export interface UpdateSecretRequestDto {
  name?: string;
  value?: string;
  note?: string | null;
}

export interface RevealSecretDto {
  id: number;
  name: string;
  environmentName: string;
  value: string;
  note: string | null;
}

export interface ImportSecretsRequestDto {
  environmentId: number;
  content: string;
  overwrite: boolean;
}

export interface ImportSecretsResultDto {
  imported: number;
  updated: number;
  skipped: number;
  invalidLines: number;
}

export interface ExportSecretsQueryDto {
  environmentId: number;
  format: ExportFormat;
}

export interface AuditEventDto {
  id: number;
  type: AuditEventType;
  message: string;
  createdAt: string;
}

export interface AuditQueryResultDto {
  events: AuditEventDto[];
  total: number;
}

export interface ShareExportRequestDto {
  passphrase: string;
}

export interface ShareContentRequestDto {
  content: string;
  passphrase: string;
}

export interface SharePreviewDto {
  projectName: string;
  environments: { name: string; secretCount: number }[];
  secretCount: number;
}

export interface ShareImportResultDto {
  projectId: number;
  projectName: string;
  environmentCount: number;
  secretCount: number;
}

export interface ShareFileDto {
  filename: string;
  content: string;
}
