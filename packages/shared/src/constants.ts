/**
 * Constantes compartidas entre todos los paquetes de SecretVault.
 * Este paquete es el "shared kernel" de la arquitectura: no depende de nada.
 */

export const APP_NAME = 'SecretVault' as const;

/** Nombre de la cookie de sesión (HttpOnly). */
export const SESSION_COOKIE = 'sv_session' as const;

/** Máscara mostrada en lugar del valor de un secreto. Longitud fija: no filtra el tamaño real. */
export const MASKED_VALUE = '••••••••' as const;

/** Ambiente creado por defecto al inicializar la bóveda. */
export const DEFAULT_ENVIRONMENT_NAME = 'Local' as const;

/** Límites de la contraseña maestra. */
export const MASTER_PASSWORD_MIN = 10;
export const MASTER_PASSWORD_MAX = 128;

/** Límites de los campos de un secreto. */
export const MAX_SECRET_VALUE_LENGTH = 100_000;
export const MAX_SECRET_NOTE_LENGTH = 2_000;
export const MAX_ENVIRONMENT_NAME_LENGTH = 40;
export const MAX_PROJECT_NAME_LENGTH = 40;

/** Proyecto que agrupa los ambientes cuando no se elige otro. */
export const DEFAULT_PROJECT_NAME = 'General' as const;
export const MAX_SECRET_NAME_LENGTH = 100;

/** Nombres de variables de entorno: LETRA/_ inicial, luego letras, dígitos, _ . - */
export const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Parámetros criptográficos por defecto. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000; // OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA256)
export const DEFAULT_AUTO_LOCK_MINUTES = 15;

/** Prefijo de todas las rutas HTTP del backend. */
export const API_BASE = '/api' as const;

/** Formatos de exportación soportados. */
export const EXPORT_FORMATS = ['env', 'csv', 'json', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** Tipos de eventos registrados en la auditoría local. */
export type AuditEventType =
  | 'vault.setup'
  | 'vault.unlock'
  | 'vault.unlock_failed'
  | 'vault.lock'
  | 'vault.password_changed'
  | 'vault.upgraded'
  | 'vault.recovered'
  | 'vault.recovery_failed'
  | 'vault.recovery_key_regenerated'
  | 'project.created'
  | 'project.renamed'
  | 'project.deleted'
  | 'env.created'
  | 'env.renamed'
  | 'env.deleted'
  | 'secret.created'
  | 'secret.updated'
  | 'secret.deleted'
  | 'secret.revealed'
  | 'secret.imported'
  | 'secret.exported'
  | 'share.exported'
  | 'share.imported'
  | 'settings.logo_changed'
  | 'settings.logo_removed';

export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  'vault.setup',
  'vault.unlock',
  'vault.unlock_failed',
  'vault.lock',
  'vault.password_changed',
  'vault.upgraded',
  'vault.recovered',
  'vault.recovery_failed',
  'vault.recovery_key_regenerated',
  'project.created',
  'project.renamed',
  'project.deleted',
  'env.created',
  'env.renamed',
  'env.deleted',
  'secret.created',
  'secret.updated',
  'secret.deleted',
  'secret.revealed',
  'secret.imported',
  'secret.exported',
  'share.exported',
  'share.imported',
  'settings.logo_changed',
  'settings.logo_removed',
];

/** Máximo de eventos de auditoría retenidos en la base de datos (se podan los más antiguos). */
export const AUDIT_MAX_EVENTS = 1_000;
