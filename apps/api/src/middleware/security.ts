/**
 * Middlewares de seguridad perimetral. La bóveda es de uso personal y solo debe
 * ser alcanzable desde este equipo; estas capas son defensa en profundidad:
 *
 *   1. Bind a 127.0.0.1 (config.host)            → la red no ve el puerto.
 *   2. `hostGuard`   (este archivo)               → anti DNS-rebinding.
 *   3. `originGuard` (este archivo)               → anti CSRF / peticiones cross-site.
 *   4. `securityHeaders`                          → CSP estricta, anti clickjacking.
 */
import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiConfig } from '../config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function forbidden(c: Parameters<MiddlewareHandler>[0], code: string, message: string): Response {
  return c.json({ error: { code, message } }, 403, { 'Cache-Control': 'no-store' });
}

/** Normaliza el hostname de una URL a la forma usada en la lista (IPv6 entre corchetes). */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Rechaza cualquier petición cuyo Host no sea el esperado. Un ataque de DNS
 * rebinding hace que `evil.com` resuelva a 127.0.0.1: el navegador cree que es
 * "same-origin" con el atacante, pero la cabecera Host delata el dominio falso.
 */
export function hostGuard(config: Pick<ApiConfig, 'allowedHosts'>): MiddlewareHandler {
  const allowed = new Set(config.allowedHosts);
  return async (c, next) => {
    const host = hostnameOf(c.req.url);
    if (host === null || !allowed.has(host)) {
      return forbidden(c, 'HOST_NOT_ALLOWED', 'Host no permitido.');
    }
    await next();
  };
}

/**
 * En métodos que mutan estado, si el navegador envía `Origin` debe coincidir con
 * el host de la propia petición. Complementa SameSite=Lax (defensa en profundidad).
 */
export function originGuard(): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      const fetchSite = c.req.header('sec-fetch-site');
      const crossSite = fetchSite === 'cross-site' || fetchSite === 'same-site';
      const originHost = origin ? safeHost(origin) : null;
      const requestHost = safeHost(c.req.url);
      const mismatch = origin !== undefined && originHost !== requestHost;
      if (mismatch || crossSite) {
        return forbidden(c, 'CROSS_ORIGIN_BLOCKED', 'Origen no permitido.');
      }
    }
    await next();
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Cabeceras de seguridad: CSP estricta (sin scripts inline), sin framing, sin referrer. */
export function securityHeaders(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Vue/Tailwind aplican estilos dinámicos por atributo `style`.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: 'no-referrer',
    xFrameOptions: 'DENY',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
  });
}
