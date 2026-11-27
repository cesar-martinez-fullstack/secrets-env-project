/**
 * Middleware de autenticación: exige una sesión desbloqueada (cookie HttpOnly
 * ligada a una clave viva en RAM). Cada request renovado (ventana deslizante).
 */
import type { MiddlewareHandler } from 'hono';
import { getConnInfo } from 'hono/bun';
import type { VaultSession } from '@secretvault/core';
import { VaultLockedError } from '@secretvault/core';
import { getSessionId, setSessionCookie } from '../http/helpers';
import type { Container } from '../container';

/** Contexto enriquecido de la app. */
export type AppEnv = {
  Variables: { session: VaultSession; requestId: string; errorCode?: string };
};

export function requireUnlocked(container: Container): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sessionId = getSessionId(c);
    if (!sessionId) throw new VaultLockedError();

    const session = await container.sessionStore.get(sessionId);
    if (!session) throw new VaultLockedError();

    const limits = await container.sessionSecurityService.currentLimits();
    const touched = await container.sessionStore.touch(sessionId, limits);
    if (!touched) throw new VaultLockedError();
    c.set('session', touched);

    // Renueva la cookie para que no muera antes que la sesión activa.
    setSessionCookie(c, touched, container.config);
    await next();
  };
}

const LOOPBACK_ADDRESS = /^(::1|(::ffff:)?127(\.\d{1,3}){3})$/;

/**
 * Un proceso local puede elegir cualquier dirección 127.x como origen: todo el loopback cuenta
 * como un solo cliente para que los límites de intentos no se multipliquen.
 */
export function normalizeClientAddress(address: string): string {
  return LOOPBACK_ADDRESS.test(address) ? 'loopback' : address;
}

/** IP del cliente (respeta X-Forwarded-For solo si SV_TRUST_PROXY=true; usa el último salto). */
export function clientIp(c: Parameters<MiddlewareHandler>[0], trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    // El ÚLTIMO valor lo añade nuestro proxy de confianza; los anteriores los controla el cliente.
    if (forwarded) return normalizeClientAddress(forwarded.split(',').at(-1)!.trim());
  }
  try {
    return normalizeClientAddress(getConnInfo(c).remote?.address ?? 'unknown');
  } catch {
    return 'unknown';
  }
}
