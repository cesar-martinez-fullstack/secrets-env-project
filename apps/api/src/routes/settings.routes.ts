/**
 * Ajustes de la instancia. Lectura pública (la pantalla de entrada necesita el logo antes de
 * desbloquear); cualquier cambio exige la bóveda abierta.
 */
import { Hono } from 'hono';
import { ValidationFailedError, type InstanceSettings } from '@secretvault/core';
import { decodeBase64 } from '@secretvault/shared';
import type { SettingsDto, UpdateAppearanceRequestDto } from '@secretvault/shared';
import { jsonResponse, readJsonBody, requireString } from '../http/helpers';
import { requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';

const toDto = ({ logo, appearance }: InstanceSettings): SettingsDto => ({
  ...appearance,
  hasLogo: logo !== null,
  logoVersion: logo ? logo.updatedAt.getTime() : null,
});

export function settingsRoutes(container: Container): Hono<AppEnv> {
  const { settingsService } = container;
  const app = new Hono<AppEnv>();

  app.get('/', async (c) => jsonResponse(c, toDto(await settingsService.get())));

  app.get('/logo', async (c) => {
    const { logo } = await settingsService.get();
    if (!logo) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'No hay logo configurado.' } }, 404, {
        'Cache-Control': 'no-store',
      });
    }
    return new Response(logo.data, {
      status: 200,
      headers: {
        'Content-Type': logo.mimeType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  });

  app.put('/appearance', requireUnlocked(container), async (c) => {
    const body = await readJsonBody<Partial<UpdateAppearanceRequestDto>>(c);
    await settingsService.updateAppearance({
      appName: body.appName as string,
      accent: body.accent as UpdateAppearanceRequestDto['accent'],
      defaultTheme: body.defaultTheme as UpdateAppearanceRequestDto['defaultTheme'],
    });
    return jsonResponse(c, toDto(await settingsService.get()));
  });

  app.put('/logo', requireUnlocked(container), async (c) => {
    const body = await readJsonBody<{ data?: unknown }>(c);
    const bytes = decodeBase64(requireString(body, 'data'));
    if (bytes === null) {
      throw new ValidationFailedError([{ field: 'data', message: 'Debe venir en base64.' }]);
    }
    await settingsService.setLogo(bytes);
    return jsonResponse(c, toDto(await settingsService.get()));
  });

  app.delete('/logo', requireUnlocked(container), async (c) => {
    await settingsService.removeLogo();
    return jsonResponse(c, toDto(await settingsService.get()));
  });

  return app;
}
