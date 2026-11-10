/**
 * Rutas de secretos: CRUD enmascarado, reveal auditado, importación masiva
 * y exportación multiformato (.env / CSV / PDF).
 */
import { Hono } from 'hono';
import { stringifyEnv } from '@secretvault/shared';
import type {
  CreateSecretRequestDto,
  ExportFormat,
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
  parseIdParam,
  readJsonBody,
  requireInt,
  requireString,
} from '../http/helpers';
import { requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';
import { buildCsvExport } from '../export/csv';
import { buildPdfExport } from '../export/pdf';

export function secretRoutes(container: Container): Hono<AppEnv> {
  const { secretService, config } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  const toDto = (s: SecretSummary): SecretDto => ({
    id: s.id,
    environmentId: s.environmentId,
    environmentName: s.environmentName,
    projectName: s.projectName,
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

  // Exportación multiformato.
  app.get('/export', async (c) => {
    const envParam = c.req.query('environmentId');
    const format = (c.req.query('format') ?? 'env') as ExportFormat;
    if (!['env', 'csv', 'pdf'].includes(format)) {
      const { ValidationFailedError } = await import('@secretvault/core');
      throw new ValidationFailedError([{ field: 'format', message: 'Formato inválido.' }]);
    }
    const environmentId = parseIdParam(envParam ?? '');

    const { entries, environmentName } = await secretService.exportEntries(
      c.get('session').key,
      environmentId,
      format,
    );

    const dateTag = new Date().toISOString().slice(0, 10);
    const slug =
      environmentName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'ambiente';
    const filename = `secretvault-${slug}-${dateTag}.${format}`;

    if (format === 'env') {
      const header = [
        `SecretVault — Ambiente: ${environmentName}`,
        `Generado: ${new Date().toISOString()}`,
        'ADVERTENCIA: este archivo contiene secretos en texto claro.',
      ].join('\n');
      const content = stringifyEnv(entries, { header });
      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'csv') {
      return new Response(buildCsvExport(entries), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const pdf = buildPdfExport({
      environmentName,
      generatedAt: new Date(),
      entries,
      iterations: config.iterations,
    });
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  });

  return app;
}
