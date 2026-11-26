import { Hono, type Context } from 'hono';
import {
  AUTO_LOCK_OPTIONS,
  CLIPBOARD_CLEAR_OPTIONS,
  LOG_LEVELS,
  type LogLevelDto,
  type UpdateLogLevelRequestDto,
  SESSION_MAX_OPTIONS,
  type SessionSecurityDto,
  type SessionSecurityValuesDto,
  type UpdateSessionSecurityRequestDto,
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

function toDto(settings: SessionSecurityValuesDto): SessionSecurityDto {
  return {
    ...settings,
    options: {
      autoLockMinutes: [...AUTO_LOCK_OPTIONS],
      sessionMaxMinutes: [...SESSION_MAX_OPTIONS],
      clipboardClearSeconds: [...CLIPBOARD_CLEAR_OPTIONS],
    },
  };
}

// Reautenticación: mismo presupuesto de intentos que el cambio de contraseña.
function guardAttempts(container: Container, c: Context<AppEnv>): string {
  const key = `change:${clientIp(c, container.config.trustProxy)}`;
  const attempt = container.rateLimiters.changePassword.hit(key);
  if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);
  return key;
}

export function securityRoutes(container: Container): Hono<AppEnv> {
  const { sessionSecurityService } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  const current = async () => toDto(await sessionSecurityService.settings());

  app.get('/', async (c) => jsonResponse<SessionSecurityDto>(c, await current()));

  app.put('/', async (c) => {
    const key = guardAttempts(container, c);

    const body = await readJsonBody<UpdateSessionSecurityRequestDto>(c);
    await sessionSecurityService.update(
      c.get('session').sessionId,
      requireString(body, 'currentPassword'),
      {
        autoLockMinutes: requireInt(body, 'autoLockMinutes'),
        sessionMaxMinutes: requireInt(body, 'sessionMaxMinutes'),
        clipboardClearSeconds: requireInt(body, 'clipboardClearSeconds'),
      },
    );
    container.rateLimiters.changePassword.reset(key);
    return jsonResponse<SessionSecurityDto>(c, await current());
  });

  registerLogLevel(app, container);
  return app;
}

function registerLogLevel(app: Hono<AppEnv>, container: Container): void {
  const current = async (): Promise<LogLevelDto> => ({
    level: await container.logLevelService.current(),
    options: [...LOG_LEVELS],
  });

  app.get('/log-level', async (c) => jsonResponse<LogLevelDto>(c, await current()));

  app.put('/log-level', async (c) => {
    const key = guardAttempts(container, c);
    const body = await readJsonBody<UpdateLogLevelRequestDto>(c);
    await container.logLevelService.change(
      c.get('session').sessionId,
      requireString(body, 'currentPassword'),
      requireString(body, 'level'),
    );
    container.rateLimiters.changePassword.reset(key);
    return jsonResponse<LogLevelDto>(c, await current());
  });
}
