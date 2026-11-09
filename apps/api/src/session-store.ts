/**
 * Almacén de sesiones EN MEMORIA. Aquí vive la clave AES-256 derivada de la
 * contraseña maestra — nunca toca disco. Al expirar (inactividad) o al cerrar
 * sesión, la clave se sobrescribe con ceros antes de descartarse.
 *
 * Nota honesta: JavaScript no garantiza borrado criptográfico de RAM (el GC
 * puede retener copias), pero zero-in-place reduce la ventana de exposición.
 */
import type { SessionStore, VaultCryptoService, VaultSession } from '@secretvault/core';
import { zeroKey } from '@secretvault/crypto';

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, VaultSession>();

  /**
   * @param maxLifetimeMinutes vida máxima ABSOLUTA de una sesión: la ventana
   *   deslizante por inactividad nunca puede extenderla más allá.
   * @param now reloj inyectable (tests deterministas).
   */
  constructor(
    private readonly crypto: VaultCryptoService,
    private readonly maxLifetimeMinutes: number = Number.POSITIVE_INFINITY,
    private readonly now: () => number = Date.now,
  ) {}

  private hardExpiry(session: VaultSession): number {
    return session.createdAt.getTime() + this.maxLifetimeMinutes * 60_000;
  }

  private slidingExpiry(session: VaultSession, ttlMinutes: number): Date {
    return new Date(Math.min(this.now() + ttlMinutes * 60_000, this.hardExpiry(session)));
  }

  async create(key: Uint8Array, ttlMinutes: number): Promise<VaultSession> {
    const sessionId = this.crypto.randomToken(32);
    const session: VaultSession = {
      sessionId,
      key,
      createdAt: new Date(this.now()),
      expiresAt: new Date(0),
    };
    session.expiresAt = this.slidingExpiry(session, ttlMinutes);
    this.sessions.set(sessionId, session);
    return session;
  }

  async get(sessionId: string): Promise<VaultSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt.getTime() <= this.now()) {
      await this.remove(sessionId);
      return null;
    }
    return session;
  }

  async touch(sessionId: string, ttlMinutes: number): Promise<VaultSession | null> {
    const session = await this.get(sessionId);
    if (!session) return null;
    session.expiresAt = this.slidingExpiry(session, ttlMinutes);
    return session;
  }

  async remove(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      zeroKey(session.key);
      this.sessions.delete(sessionId);
    }
  }

  async purgeExpired(): Promise<number> {
    let purged = 0;
    const now = this.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt.getTime() <= now) {
        zeroKey(session.key);
        this.sessions.delete(sessionId);
        purged++;
      }
    }
    return purged;
  }

  async clear(): Promise<void> {
    for (const session of this.sessions.values()) zeroKey(session.key);
    this.sessions.clear();
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }
}
