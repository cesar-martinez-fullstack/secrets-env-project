import { Hono } from 'hono';
import type {
  CreateProjectRequestDto,
  OkDto,
  ProjectDto,
  RenameProjectRequestDto,
} from '@secretvault/shared';
import type { Project, ProjectWithCount } from '@secretvault/core';
import { jsonResponse, parseIdParam, readJsonBody, requireString } from '../http/helpers';
import { requireUnlocked, type AppEnv } from '../middleware/auth';
import type { Container } from '../container';

const toDto = (project: ProjectWithCount): ProjectDto => ({
  id: project.id,
  name: project.name,
  environmentCount: project.environmentCount,
  createdAt: project.createdAt.toISOString(),
});

const withoutEnvironments = (project: Project): ProjectWithCount => ({
  ...project,
  environmentCount: 0,
});

export function projectRoutes(container: Container): Hono<AppEnv> {
  const { projectService } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  app.get('/', async (c) => jsonResponse(c, (await projectService.list()).map(toDto)));

  app.post('/', async (c) => {
    const body = await readJsonBody<CreateProjectRequestDto>(c);
    const created = await projectService.create(requireString(body, 'name'));
    return jsonResponse<ProjectDto>(c, toDto(withoutEnvironments(created)), 201);
  });

  app.patch('/:id', async (c) => {
    const body = await readJsonBody<RenameProjectRequestDto>(c);
    const renamed = await projectService.rename(
      parseIdParam(c.req.param('id')),
      requireString(body, 'name'),
    );
    return jsonResponse<ProjectDto>(c, toDto(withoutEnvironments(renamed)));
  });

  app.delete('/:id', async (c) => {
    await projectService.remove(parseIdParam(c.req.param('id')));
    return jsonResponse<OkDto>(c, { ok: true });
  });

  return app;
}
