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

export interface EnvironmentDto {
  id: number;
  name: string;
  secretCount: number;
  createdAt: string;
}

export interface CreateEnvironmentRequestDto {
  name: string;
}

export interface RenameEnvironmentRequestDto {
  name: string;
}

export interface SecretDto {
  id: number;
  environmentId: number;
  environmentName: string;
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
