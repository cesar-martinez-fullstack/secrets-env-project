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
export const MAX_BULK_SECRETS = 200;
export const MAX_IMPORT_ENTRIES = 2_000;
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
export const EXPORT_FORMATS = ['env', 'csv', 'json', 'pdf', 'postman'] as const;
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
  | 'vault.backup_created'
  | 'vault.reauth_failed'
  | 'audit.retention_changed'
  | 'audit.cleared'
  | 'project.created'
  | 'project.renamed'
  | 'project.deleted'
  | 'env.created'
  | 'env.renamed'
  | 'env.moved'
  | 'env.deleted'
  | 'secret.created'
  | 'secret.updated'
  | 'secret.deleted'
  | 'secret.revealed'
  | 'secret.imported'
  | 'secret.exported'
  | 'share.exported'
  | 'update.checked'
  | 'share.imported'
  | 'settings.logo_changed'
  | 'settings.logo_removed'
  | 'settings.appearance_changed';

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
  'vault.backup_created',
  'vault.reauth_failed',
  'audit.retention_changed',
  'audit.cleared',
  'project.created',
  'project.renamed',
  'project.deleted',
  'env.created',
  'env.renamed',
  'env.moved',
  'env.deleted',
  'secret.created',
  'secret.updated',
  'secret.deleted',
  'secret.revealed',
  'secret.imported',
  'secret.exported',
  'share.exported',
  'update.checked',
  'share.imported',
  'settings.logo_changed',
  'settings.logo_removed',
  'settings.appearance_changed',
];

/** Cambios sobre el propio historial: tienen cuota propia para que ningún otro evento los expulse. */
export const AUDIT_HISTORY_EVENTS: readonly AuditEventType[] = [
  'audit.cleared',
  'audit.retention_changed',
];
export const AUDIT_HISTORY_EVENTS_KEPT = 100;

/** Intentos fallidos: se pueden provocar sin credenciales, así que no desplazan al resto. */
export const AUDIT_FAILURE_EVENTS: readonly AuditEventType[] = [
  'vault.unlock_failed',
  'vault.recovery_failed',
  'vault.reauth_failed',
];
export const AUDIT_FAILURE_EVENTS_KEPT = 200;

/** Eventos de auditoría retenidos por defecto (se podan los más antiguos). */
export const AUDIT_MAX_EVENTS = 1_000;

/** Opciones de retención que se pueden elegir en Ajustes. */
export const AUDIT_RETENTION_OPTIONS = [500, 1_000, 5_000, 10_000] as const;

export type AuditRetentionOption = (typeof AUDIT_RETENTION_OPTIONS)[number];

export function isAuditRetention(value: unknown): value is AuditRetentionOption {
  return (AUDIT_RETENTION_OPTIONS as readonly unknown[]).includes(value);
}
