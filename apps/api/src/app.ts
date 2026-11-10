/**
 * Ensamble de la app Hono: rutas del API, manejo de errores y servidor del SPA.
 */
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { DomainError } from '@secretvault/core';
import { vaultRoutes } from './routes/vault.routes';
import { projectRoutes } from './routes/projects.routes';
import { environmentRoutes } from './routes/environments.routes';
import { secretRoutes } from './routes/secrets.routes';
import { auditRoutes } from './routes/audit.routes';
import { serveWebApp } from './http/static';
import { hostGuard, originGuard, securityHeaders } from './middleware/security';
import type { Container } from './container';
import type { AppEnv } from './middleware/auth';

export function createApp(container: Container): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // --- Perímetro: cabeceras, Host (anti DNS-rebinding) y Origin (anti CSRF) ---
  app.use('*', securityHeaders());
  app.use('*', hostGuard(container.config));
  app.use('/api/*', originGuard());

  // --- Errores de dominio → respuestas JSON estables ---
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
      if (err.status === 429) headers['Retry-After'] = '60';
      return c.json(
        { error: { code: err.code, message: err.message, issues: err.issues } },
        err.status as ContentfulStatusCode,
        headers,
      );
    }
    console.error('[SecretVault] Error interno:', err);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } },
      500,
      { 'Cache-Control': 'no-store' },
    );
  });

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${c.req.path}` } },
        404,
        { 'Cache-Control': 'no-store' },
      );
    }
    return c.text('No encontrado', 404);
  });

  // --- Salud (también no-cache: ningún endpoint del API es cacheable) ---
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', app: 'SecretVault' }, 200, { 'Cache-Control': 'no-store' }),
  );

  // --- API ---
  app.route('/api/vault', vaultRoutes(container));
  app.route('/api/projects', projectRoutes(container));
  app.route('/api/environments', environmentRoutes(container));
  app.route('/api/secrets', secretRoutes(container));
  app.route('/api/audit', auditRoutes(container));

  // --- SPA (frontend compilado) — catch-all para GET ---
  app.get('*', (c) => serveWebApp(container.config.publicDir, c));

  return app;
}
