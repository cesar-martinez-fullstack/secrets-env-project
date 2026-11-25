/**
 * Rutas de auditoría: historial paginado de eventos de la bóveda.
 */
import { Hono } from 'hono';
import type {
  AuditQueryResultDto,
  AuditRetentionDto,
  ClearAuditRequestDto,
  ClearAuditResultDto,
  UpdateAuditRetentionRequestDto,
} from '@secretvault/shared';
import {
  jsonResponse,
  rateLimited,
  readJsonBody,
  requireInt,
  requireString,
} from '../http/helpers';
import { clientIp, requireUnlocked, type AppEnv } from '../middleware/auth';
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

  const retention = async (): Promise<AuditRetentionDto> => {
    const { maxEvents, options } = await auditService.retention();
    return { maxEvents, options: [...options] };
  };

  // Reautenticación: mismo presupuesto de intentos que el cambio de contraseña (clave `change:`).
  const guardAttempts = (ip: string): string => {
    const key = `change:${ip}`;
    const attempt = container.rateLimiters.changePassword.hit(key);
    if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);
    return key;
  };

  app.get('/retention', async (c) => jsonResponse<AuditRetentionDto>(c, await retention()));

  app.put('/retention', async (c) => {
    const key = guardAttempts(clientIp(c, container.config.trustProxy));
    const body = await readJsonBody<UpdateAuditRetentionRequestDto>(c);
    await auditService.setRetention(
      c.get('session').sessionId,
      requireString(body, 'currentPassword'),
      requireInt(body, 'maxEvents'),
    );
    container.rateLimiters.changePassword.reset(key);
    return jsonResponse<AuditRetentionDto>(c, await retention());
  });

  app.post('/clear', async (c) => {
    const key = guardAttempts(clientIp(c, container.config.trustProxy));
    const body = await readJsonBody<ClearAuditRequestDto>(c);
    const deleted = await auditService.clear(
      c.get('session').sessionId,
      requireString(body, 'currentPassword'),
    );
    container.rateLimiters.changePassword.reset(key);
    return jsonResponse<ClearAuditResultDto>(c, { deleted });
  });

  return app;
}
