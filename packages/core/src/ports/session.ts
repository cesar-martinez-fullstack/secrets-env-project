/**
 * Puerto del almacén de sesiones en memoria.
 * La clave derivada de la contraseña maestra vive EXCLUSIVAMENTE aquí, en RAM.
 * Se borra (se sobrescribe con ceros) al cerrar sesión o por inactividad.
 */
import type { VaultSession } from '../domain/entities';

export interface SessionLimits {
  /** Minutos sin actividad antes de bloquear. */
  idleMinutes: number;
  /** Vida máxima desde que se abrió, aunque haya actividad. */
  maxMinutes: number;
}

export interface SessionLimitsProvider {
  currentLimits(): Promise<SessionLimits>;
}

export interface SessionStore {
  /** Crea una sesión con una clave y sus límites. */
  create(key: Uint8Array, limits: SessionLimits): Promise<VaultSession>;

  /** Recupera una sesión viva o null si no existe / expiró. */
  get(sessionId: string): Promise<VaultSession | null>;

  /** Renueva la ventana de inactividad; si ya superó su vida máxima la destruye y devuelve null. */
  touch(sessionId: string, limits: SessionLimits): Promise<VaultSession | null>;

  /** Acorta las sesiones abiertas que excedan los límites nuevos; nunca las alarga. */
  applyLimits(limits: SessionLimits): Promise<void>;

  /** Elimina la sesión y destruye la clave en memoria. */
  remove(sessionId: string): Promise<void>;

  /** Purga sesiones expiradas (auto-lock por inactividad). Devuelve cuántas murieron. */
  purgeExpired(): Promise<number>;

  /** Destruye TODAS las sesiones y sus claves (cierre del proceso). */
  clear(): Promise<void>;

  /** Número de sesiones activas. */
  count(): Promise<number>;
}
