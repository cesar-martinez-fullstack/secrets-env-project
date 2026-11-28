import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../middleware/auth';
import type { Logger, LogFields } from './logger';

// Consultas automáticas y frecuentes: solo interesan al depurar.
const ROUTINE_ROUTES = new Set(['/api/health', '/api/vault/status']);
const REFUSED = new Set([401, 403, 429]);

/** Patrón registrado (`/api/secrets/:id`), nunca la dirección literal ni la búsqueda. */
function routePattern(c: Context): string {
  return c.req.matchedRoutes.filter((r) => !r.path.includes('*')).at(-1)?.path ?? 'unmatched';
}

function levelFor(status: number, route: string): 'debug' | 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error';
  if (REFUSED.has(status)) return 'warn';
  return ROUTINE_ROUTES.has(route) || route === 'unmatched' ? 'debug' : 'info';
}

export function requestLog(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = randomUUID();
    c.set('requestId', requestId);
    const started = performance.now();
    await next();
    c.res.headers.set('X-Request-Id', requestId);
    const route = routePattern(c);
    const { status } = c.res;
    logger[levelFor(status, route)]('http.request', {
      requestId,
      method: c.req.method,
      route,
      status,
      code: c.get('errorCode'),
      ms: Math.round(performance.now() - started),
    });
  };
}

/**
 * El mensaje de un error inesperado puede citar datos recibidos (p. ej. un JSON roto), así que
 * solo se registran su tipo y las líneas de la traza.
 */
export function describeError(error: Error): LogFields {
  // El mensaje va delante en la traza y puede tener líneas que parezcan marcos.
  const frames = (error.stack ?? '')
    .replace(error.message, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
  return { errorName: error.constructor.name, stack: frames.slice(0, 8).join(' | ') };
}
