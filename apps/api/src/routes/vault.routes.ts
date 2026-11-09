/**
 * Rutas de la bóveda: estado, setup, unlock, lock y rotación de contraseña.
 */
import { Hono } from 'hono';
import type {
  ChangeMasterPasswordRequestDto,
  OkDto,
  SetupVaultRequestDto,
  UnlockVaultRequestDto,
  VaultStatusDto,
} from '@secretvault/shared';
import { DomainError } from '@secretvault/core';
import {
  clearSessionCookie,
  getSessionId,
  jsonResponse,
  readJsonBody,
  requireString,
  setSessionCookie,
} from '../http/helpers';
import { clientIp, requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';

export function vaultRoutes(container: Container): Hono<AppEnv> {
  const { vaultService, sessionStore, config } = container;
  const unlockLimiter = container.rateLimiters.unlock;

  const app = new Hono<AppEnv>();

  app.get('/status', async (c) => {
    const status = await vaultService.status();
    const sessionId = getSessionId(c);
    const session = sessionId ? await sessionStore.get(sessionId) : null;
    const dto: VaultStatusDto = { ...status, unlocked: session !== null };
    return jsonResponse(c, dto);
  });

  app.post('/setup', async (c) => {
    const ip = clientIp(c, config.trustProxy);
    const attempt = container.rateLimiters.setup.hit(`setup:${ip}`);
    if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);

    const body = await readJsonBody<SetupVaultRequestDto>(c);
    const masterPassword = requireString(body, 'masterPassword');

    const session = await vaultService.setup(masterPassword);
    container.rateLimiters.setup.reset(`setup:${ip}`);
    setSessionCookie(c, session.sessionId, config);
    return jsonResponse<OkDto>(c, { ok: true }, 201);
  });

  app.post('/unlock', async (c) => {
    const ip = clientIp(c, config.trustProxy);
    const key = `unlock:${ip}`;
    const attempt = unlockLimiter.hit(key);
    if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);

    const body = await readJsonBody<UnlockVaultRequestDto>(c);
    const masterPassword = requireString(body, 'masterPassword');

    // InvalidMasterPasswordError se propaga al onError; el contador ya quedó incrementado.
    const session = await vaultService.unlock(masterPassword);
    unlockLimiter.reset(key);
    setSessionCookie(c, session.sessionId, config);
    return jsonResponse<OkDto>(c, { ok: true });
  });

  app.post('/lock', async (c) => {
    const sessionId = getSessionId(c);
    await vaultService.lock(sessionId);
    clearSessionCookie(c);
    return jsonResponse<OkDto>(c, { ok: true });
  });

  app.post('/change-password', requireUnlocked(container), async (c) => {
    const ip = clientIp(c, config.trustProxy);
    const key = `change:${ip}`;
    const attempt = container.rateLimiters.changePassword.hit(key);
    if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);

    const body = await readJsonBody<ChangeMasterPasswordRequestDto>(c);
    const currentPassword = requireString(body, 'currentPassword');
    const newPassword = requireString(body, 'newPassword');

    await vaultService.changeMasterPassword(
      c.get('session').sessionId,
      currentPassword,
      newPassword,
    );
    container.rateLimiters.changePassword.reset(key);
    return jsonResponse<OkDto>(c, { ok: true });
  });

  return app;
}

function rateLimited(retryAfterSeconds: number): DomainError {
  return new DomainError(
    'RATE_LIMITED',
    `Demasiados intentos. Espera ${retryAfterSeconds}s antes de reintentar.`,
    429,
  );
}
