import { Hono } from 'hono';
import { SHARE_FILE_EXTENSION } from '@secretvault/shared';
import type {
  ShareImportRequestDto,
  SharePreviewRequestDto,
  ShareExportRequestDto,
  ShareFileDto,
  ShareImportResultDto,
  SharePreviewDto,
} from '@secretvault/shared';
import type { ShareFile } from '@secretvault/core';
import {
  jsonResponse,
  optionalInt,
  parseIdParam,
  rateLimited,
  readJsonBody,
  requireBoolean,
  requireString,
  requireStringList,
} from '../http/helpers';
import { clientIp, requireUnlocked, type AppEnv } from '../middleware/auth';
import { fileSlug } from '../export/formatters';
import type { Container } from '../container';

const toDto = (file: ShareFile): ShareFileDto => {
  const slug = fileSlug(
    [file.projectName, file.environmentName].filter(Boolean).join(' '),
    'archivo',
  );
  return { filename: `secretvault-${slug}.${SHARE_FILE_EXTENSION}`, content: file.content };
};

export function shareRoutes(container: Container): Hono<AppEnv> {
  const { shareService, config } = container;
  const app = new Hono<AppEnv>();

  app.use('*', requireUnlocked(container));

  const guardAttempts = (ip: string): string => {
    const key = `share:${ip}`;
    const attempt = container.rateLimiters.share.hit(key);
    if (!attempt.allowed) throw rateLimited(attempt.retryAfterSeconds);
    return key;
  };

  app.post('/projects/:id/export', async (c) => {
    const body = await readJsonBody<ShareExportRequestDto>(c);
    const file = await shareService.exportProject(
      c.get('session').key,
      parseIdParam(c.req.param('id')),
      requireString(body, 'passphrase'),
    );
    return jsonResponse<ShareFileDto>(c, toDto(file));
  });

  app.post('/environments/:id/export', async (c) => {
    const body = await readJsonBody<ShareExportRequestDto>(c);
    const file = await shareService.exportEnvironment(
      c.get('session').key,
      parseIdParam(c.req.param('id')),
      requireString(body, 'passphrase'),
    );
    return jsonResponse<ShareFileDto>(c, toDto(file));
  });

  app.post('/preview', async (c) => {
    const key = guardAttempts(clientIp(c, config.trustProxy));
    const body = await readJsonBody<SharePreviewRequestDto>(c);
    const preview = await shareService.preview(
      requireString(body, 'content'),
      requireString(body, 'passphrase'),
      optionalInt(body, 'projectId'),
    );
    container.rateLimiters.share.reset(key);
    return jsonResponse<SharePreviewDto>(c, preview);
  });

  app.post('/import', async (c) => {
    const key = guardAttempts(clientIp(c, config.trustProxy));
    const body = await readJsonBody<ShareImportRequestDto>(c);
    const result = await shareService.importPackage(
      c.get('session').key,
      requireString(body, 'content'),
      {
        passphrase: requireString(body, 'passphrase'),
        projectId: optionalInt(body, 'projectId'),
        separateEnvironments: requireStringList(body, 'separateEnvironments'),
        overwrite: requireBoolean(body, 'overwrite'),
      },
    );
    container.rateLimiters.share.reset(key);
    return jsonResponse<ShareImportResultDto>(c, result, 201);
  });

  return app;
}
