/**
 * Rutas de ambientes: listar (con conteo), crear, renombrar y eliminar.
 */
import { Hono } from 'hono';
import type {
  CreateEnvironmentRequestDto,
  EnvironmentDto,
  OkDto,
  RenameEnvironmentRequestDto,
} from '@secretvault/shared';
import {
  jsonResponse,
  parseIdParam,
  readJsonBody,
  requireInt,
  requireString,
} from '../http/helpers';
import { requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';
import type { EnvironmentWithCount } from '@secretvault/core';

export function environmentRoutes(container: Container): Hono<AppEnv> {
  const { environmentService } = container;
  const app = new Hono<AppEnv>();

  const toDto = (env: EnvironmentWithCount): EnvironmentDto => ({
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    secretCount: env.secretCount,
    createdAt: env.createdAt.toISOString(),
  });

  app.use('*', requireUnlocked(container));

  app.get('/', async (c) => {
    const environments = await environmentService.list();
    return jsonResponse(c, environments.map(toDto));
  });

  app.post('/', async (c) => {
    const body = await readJsonBody<CreateEnvironmentRequestDto>(c);
    const created = await environmentService.create(
      requireInt(body, 'projectId'),
      requireString(body, 'name'),
    );
    return jsonResponse<EnvironmentDto>(c, toDto({ ...created, secretCount: 0 }), 201);
  });

  app.patch('/:id', async (c) => {
    const id = parseIdParam(c.req.param('id'));
    const body = await readJsonBody<RenameEnvironmentRequestDto>(c);
    const name = requireString(body, 'name');
    const renamed = await environmentService.rename(id, name);
    return jsonResponse<EnvironmentDto>(c, toDto({ ...renamed, secretCount: 0 }));
  });

  app.delete('/:id', async (c) => {
    const id = parseIdParam(c.req.param('id'));
    const { deletedSecrets } = await environmentService.delete(id);
    return jsonResponse<OkDto & { deletedSecrets: number }>(c, { ok: true, deletedSecrets });
  });

  return app;
}
