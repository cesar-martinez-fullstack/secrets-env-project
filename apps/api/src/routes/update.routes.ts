/**
 * Comprobación manual de versiones nuevas. Es la única ruta que provoca una petición saliente y
 * solo se ejecuta cuando la persona pulsa el botón; no instala ni descarga nada.
 */
import { Hono } from 'hono';
import { DomainError } from '@secretvault/core';
import type { UpdateCheckDto } from '@secretvault/shared';
import { jsonResponse, rateLimited } from '../http/helpers';
import { clientIp, requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';

export function updateRoutes(container: Container): Hono<AppEnv> {
  const { updateService, config } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  app.post('/check', async (c) => {
    if (!config.updateCheckEnabled) {
      throw new DomainError(
        'UPDATE_CHECK_DISABLED',
        'La comprobación de actualizaciones está desactivada en esta instalación (SV_UPDATE_CHECK=false).',
        403,
      );
    }
    const attempt = container.rateLimiters.update.hit(`update:${clientIp(c, config.trustProxy)}`);
    if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);

    const result = await updateService.check();
    return jsonResponse<UpdateCheckDto>(c, {
      ...result,
      checkedAt: result.checkedAt.toISOString(),
    });
  });

  return app;
}
