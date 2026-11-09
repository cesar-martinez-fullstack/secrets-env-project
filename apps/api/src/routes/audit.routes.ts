/**
 * Rutas de auditoría: historial paginado de eventos de la bóveda.
 */
import { Hono } from 'hono';
import type { AuditQueryResultDto } from '@secretvault/shared';
import { jsonResponse } from '../http/helpers';
import { requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';

export function auditRoutes(container: Container): Hono<AppEnv> {
  const { auditService } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  app.get('/', async (c) => {
    const limitRaw = Number.parseInt(c.req.query('limit') ?? '', 10);
    const offsetRaw = Number.parseInt(c.req.query('offset') ?? '', 10);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const { events, total } = await auditService.list(limit, offset);
    const dto: AuditQueryResultDto = {
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
    };
    return jsonResponse(c, dto);
  });

  return app;
}
