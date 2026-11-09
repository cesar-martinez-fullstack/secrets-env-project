/**
 * Puerto del almacén de sesiones en memoria.
 * La clave derivada de la contraseña maestra vive EXCLUSIVAMENTE aquí, en RAM.
 * Se borra (se sobrescribe con ceros) al cerrar sesión o por inactividad.
 */
import type { VaultSession } from '../domain/entities';

export interface SessionStore {
  /** Crea una sesión con una clave y TTL (minutos de inactividad). */
  create(key: Uint8Array, ttlMinutes: number): Promise<VaultSession>;

  /** Recupera una sesión viva o null si no existe / expiró. */
  get(sessionId: string): Promise<VaultSession | null>;

  /** Renueva la expiración (ventana deslizante de inactividad). */
  touch(sessionId: string, ttlMinutes: number): Promise<VaultSession | null>;

  /** Elimina la sesión y destruye la clave en memoria. */
  remove(sessionId: string): Promise<void>;

  /** Purga sesiones expiradas (auto-lock por inactividad). Devuelve cuántas murieron. */
  purgeExpired(): Promise<number>;

  /** Destruye TODAS las sesiones y sus claves (cierre del proceso). */
  clear(): Promise<void>;

  /** Número de sesiones activas. */
  count(): Promise<number>;
}
