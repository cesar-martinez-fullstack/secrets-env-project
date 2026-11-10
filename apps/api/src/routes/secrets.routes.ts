/**
 * Rutas de secretos: CRUD enmascarado, reveal auditado, importación masiva
 * y exportación multiformato (.env / CSV / PDF).
 */
import { Hono } from 'hono';
import type {
  CreateSecretRequestDto,
  ImportSecretsRequestDto,
  ImportSecretsResultDto,
  OkDto,
  RevealSecretDto,
  SecretDto,
  UpdateSecretRequestDto,
} from '@secretvault/shared';
import type { SecretSummary } from '@secretvault/core';
import {
  jsonResponse,
  parseExportFormat,
  parseIdParam,
  readJsonBody,
  requireInt,
  requireString,
} from '../http/helpers';
import { requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';
import { EXPORT_FORMATTERS, exportFilename } from '../export/formatters';

export function secretRoutes(container: Container): Hono<AppEnv> {
  const { secretService, config } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  const toDto = (s: SecretSummary): SecretDto => ({
    id: s.id,
    environmentId: s.environmentId,
    environmentName: s.environmentName,
    name: s.name,
    maskedValue: s.maskedValue,
    hasNote: s.hasNote,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  });

  // Listado (enmascarado) — ?environmentId=1&q=DB_  (q busca en TODOS los ambientes)
  app.get('/', async (c) => {
    const envParam = c.req.query('environmentId');
    const q = c.req.query('q')?.trim() ?? '';
    const environmentId =
      envParam !== undefined && Number.isInteger(Number(envParam)) ? Number(envParam) : undefined;
    const secrets = await secretService.list({
      environmentId,
      query: q.length > 0 ? q : undefined,
    });
    return jsonResponse(c, secrets.map(toDto));
  });

  app.post('/', async (c) => {
    const body = await readJsonBody<CreateSecretRequestDto>(c);
    const created = await secretService.create(c.get('session').key, {
      environmentId: requireInt(body, 'environmentId'),
      name: requireString(body, 'name'),
      value: requireString(body, 'value'),
      note: typeof body.note === 'string' ? body.note : null,
    });
    return jsonResponse<SecretDto>(c, toDto(created), 201);
  });

  app.patch('/:id', async (c) => {
    const id = parseIdParam(c.req.param('id'));
    const body = await readJsonBody<UpdateSecretRequestDto>(c);
    const updated = await secretService.update(c.get('session').key, id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      value: typeof body.value === 'string' ? body.value : undefined,
      note: body.note === undefined ? undefined : typeof body.note === 'string' ? body.note : null,
    });
    return jsonResponse<SecretDto>(c, toDto(updated));
  });

  app.delete('/:id', async (c) => {
    const id = parseIdParam(c.req.param('id'));
    await secretService.remove(id);
    return jsonResponse<OkDto>(c, { ok: true });
  });

  // Reveal: desencripta bajo demanda y audita el acceso.
  app.post('/:id/reveal', async (c) => {
    const id = parseIdParam(c.req.param('id'));
    const secret = await secretService.reveal(c.get('session').key, id);
    const dto: RevealSecretDto = {
      id: secret.id,
      name: secret.name,
      environmentName: secret.environmentName,
      value: secret.value,
      note: secret.note,
    };
    return jsonResponse(c, dto);
  });

  // Importación masiva desde contenido .env.
  app.post('/import', async (c) => {
    const body = await readJsonBody<ImportSecretsRequestDto>(c);
    const result = await secretService.import(
      c.get('session').key,
      requireInt(body, 'environmentId'),
      requireString(body, 'content'),
      body.overwrite === true,
    );
    const dto: ImportSecretsResultDto = result;
    return jsonResponse(c, dto);
  });

  app.get('/export', async (c) => {
    const format = parseExportFormat(c.req.query('format') ?? 'env');
    const environmentId = parseIdParam(c.req.query('environmentId') ?? '');
    const { entries, environmentName } = await secretService.exportEntries(
      c.get('session').key,
      environmentId,
      format,
    );

    const generatedAt = new Date();
    const formatter = EXPORT_FORMATTERS[format];
    const body = formatter.build({
      environmentName,
      generatedAt,
      entries,
      iterations: config.iterations,
    });
    const filename = exportFilename(environmentName, generatedAt, format);
    return new Response(body, {
      headers: {
        'Content-Type': formatter.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  });

  return app;
}
