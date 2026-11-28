/**
 * Almacén de sesiones EN MEMORIA. Aquí vive la clave AES-256 derivada de la
 * contraseña maestra — nunca toca disco. Al expirar (inactividad) o al cerrar
 * sesión, la clave se sobrescribe con ceros antes de descartarse.
 *
 * Nota honesta: JavaScript no garantiza borrado criptográfico de RAM (el GC
 * puede retener copias), pero zero-in-place reduce la ventana de exposición.
 */
import type {
  SessionLimits,
  SessionStore,
  VaultCryptoService,
  VaultSession,
} from '@secretvault/core';
import { zeroKey } from '@secretvault/crypto';

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, VaultSession>();

  constructor(
    private readonly crypto: VaultCryptoService,
    private readonly now: () => number = Date.now,
  ) {}

  /** La ventana de inactividad nunca pasa de la vida máxima absoluta. */
  private expiryFor(session: VaultSession, limits: SessionLimits): Date {
    const hard = session.createdAt.getTime() + limits.maxMinutes * 60_000;
    return new Date(Math.min(this.now() + limits.idleMinutes * 60_000, hard));
  }

  async create(key: Uint8Array, limits: SessionLimits): Promise<VaultSession> {
    const sessionId = this.crypto.randomToken(32);
    const session: VaultSession = {
      sessionId,
      key,
      createdAt: new Date(this.now()),
      expiresAt: new Date(0),
    };
    session.expiresAt = this.expiryFor(session, limits);
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

  async touch(sessionId: string, limits: SessionLimits): Promise<VaultSession | null> {
    const session = await this.get(sessionId);
    if (!session) return null;
    session.expiresAt = this.expiryFor(session, limits);
    return this.get(sessionId);
  }

  async applyLimits(limits: SessionLimits): Promise<void> {
    for (const session of this.sessions.values()) {
      const capped = this.expiryFor(session, limits);
      if (capped < session.expiresAt) session.expiresAt = capped;
    }
    await this.purgeExpired();
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
