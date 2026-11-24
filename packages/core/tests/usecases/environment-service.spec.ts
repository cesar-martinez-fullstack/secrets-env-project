/**
 * Tests unitarios de EnvironmentService y AuditService.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  EnvironmentNotFoundError,
  EnvironmentNameRequiredError,
  EnvironmentNameTakenError,
  ProjectNotFoundError,
} from '../../src/domain/errors';
import { EnvironmentService } from '../../src/usecases/environment-service';
import { AuditService } from '../../src/usecases/audit-service';
import {
  mockAuditRepo,
  mockEnvRepo,
  mockProjectRepo,
  mockSecretRepo,
  type MockAuditRepo,
  type MockEnvRepo,
  type MockProjectRepo,
  type MockSecretRepo,
} from '../helpers/mocks';

const env = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  projectId: 1,
  name: 'Local',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('EnvironmentService', () => {
  let projects: MockProjectRepo;
  let envs: MockEnvRepo;
  let secrets: MockSecretRepo;
  let audit: MockAuditRepo;
  let service: EnvironmentService;

  beforeEach(() => {
    projects = mockProjectRepo();
    envs = mockEnvRepo();
    secrets = mockSecretRepo();
    audit = mockAuditRepo();
    projects.findById.mockResolvedValue({ id: 1, name: 'General' });
    service = new EnvironmentService({
      projects: projects.repo,
      environments: envs.repo,
      secrets: secrets.repo,
      audit: audit.repo,
    });
  });

  describe('list', () => {
    it('should return environments with their secret counts', async () => {
      envs.listWithCounts.mockResolvedValue([{ ...env(), secretCount: 4 }]);
      const list = await service.list();
      expect(list[0]?.name).toBe('Local');
      expect(list[0]?.secretCount).toBe(4);
    });
  });

  describe('create', () => {
    it('should trim the name, create it inside the project and audit', async () => {
      envs.findByName.mockResolvedValue(null);
      envs.create.mockResolvedValue(env({ id: 2, name: 'QA' }));

      const created = await service.create(1, '  QA  ');

      expect(envs.findByName).toHaveBeenCalledWith(1, 'QA');
      expect(envs.create).toHaveBeenCalledWith(1, 'QA');
      expect(created.name).toBe('QA');
      expect(audit.record).toHaveBeenCalledWith('env.created', expect.stringContaining('General'));
    });

    it('should reject duplicate names inside the same project, ignoring case', async () => {
      envs.findByName.mockResolvedValue(env({ name: 'local' }));
      await expect(service.create(1, 'LOCAL')).rejects.toThrow(EnvironmentNameTakenError);
      expect(envs.create).not.toHaveBeenCalled();
    });

    it('should reject a project that does not exist before touching environments', async () => {
      projects.findById.mockResolvedValue(null);
      await expect(service.create(9, 'QA')).rejects.toThrow(ProjectNotFoundError);
      expect(envs.findByName).not.toHaveBeenCalled();
    });

    it('should reject empty names', async () => {
      await expect(service.create(1, '   ')).rejects.toThrow(EnvironmentNameRequiredError);
      expect(envs.findByName).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('should rename and audit the transition old → new', async () => {
      envs.findById.mockResolvedValue(env({ id: 1, name: 'Local' }));
      envs.findByName.mockResolvedValue(null);
      envs.rename.mockResolvedValue(undefined);

      const renamed = await service.rename(1, '  Dev  ');

      expect(envs.findByName).toHaveBeenCalledWith(1, 'Dev');
      expect(envs.rename).toHaveBeenCalledWith(1, 'Dev');
      expect(renamed.name).toBe('Dev');
      expect(audit.record).toHaveBeenCalledWith('env.renamed', expect.stringContaining('Local'));
      expect(audit.record).toHaveBeenCalledWith('env.renamed', expect.stringContaining('Dev'));
    });

    it('should allow keeping the same name (rename to itself)', async () => {
      envs.findById.mockResolvedValue(env({ id: 1, name: 'Local' }));
      envs.findByName.mockResolvedValue(env({ id: 1, name: 'Local' }));

      await service.rename(1, 'Local');
      expect(envs.rename).toHaveBeenCalledWith(1, 'Local');
    });

    it('should reject renaming to a name taken by another environment', async () => {
      envs.findById.mockResolvedValue(env({ id: 1, name: 'Local' }));
      envs.findByName.mockResolvedValue(env({ id: 2, name: 'QA' }));

      await expect(service.rename(1, 'QA')).rejects.toThrow(EnvironmentNameTakenError);
      expect(envs.rename).not.toHaveBeenCalled();
    });

    it('should throw EnvironmentNotFoundError for unknown ids', async () => {
      envs.findById.mockResolvedValue(null);
      await expect(service.rename(99, 'X')).rejects.toThrow(EnvironmentNotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete with cascade and audit the number of secrets removed', async () => {
      envs.findById.mockResolvedValue(env({ id: 1, name: 'QA' }));
      secrets.list.mockResolvedValue([
        {
          id: 1,
          environmentId: 1,
          environmentName: 'QA',
          projectName: 'General',
          name: 'A',
          valueEnc: new Uint8Array(4),
          noteEnc: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          environmentId: 1,
          environmentName: 'QA',
          projectName: 'General',
          name: 'B',
          valueEnc: new Uint8Array(4),
          noteEnc: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.delete(1);

      expect(envs.delete).toHaveBeenCalledWith(1);
      expect(result.deletedSecrets).toBe(2);
      expect(audit.record).toHaveBeenCalledWith(
        'env.deleted',
        expect.stringContaining('2 secreto(s)'),
      );
    });

    it('should throw EnvironmentNotFoundError for unknown ids', async () => {
      envs.findById.mockResolvedValue(null);
      await expect(service.delete(99)).rejects.toThrow(EnvironmentNotFoundError);
      expect(envs.delete).not.toHaveBeenCalled();
    });
  });
});

describe('AuditService', () => {
  let audit: MockAuditRepo;
  let service: AuditService;

  beforeEach(() => {
    audit = mockAuditRepo();
    service = new AuditService({ audit: audit.repo });
  });

  it('should return paginated events with the total', async () => {
    const event = { id: 1, type: 'secret.created' as const, message: 'm', createdAt: new Date() };
    audit.list.mockResolvedValue([event]);
    audit.count.mockResolvedValue(42);

    const result = await service.list(50, 0);

    expect(audit.list).toHaveBeenCalledWith(50, 0);
    expect(result.total).toBe(42);
    expect(result.events[0]?.type).toBe('secret.created');
  });

  it('should pass through limit and offset to the repository', async () => {
    audit.list.mockResolvedValue([]);
    audit.count.mockResolvedValue(0);
    await service.list(10, 20);
    expect(audit.list).toHaveBeenCalledWith(10, 20);
  });
});
