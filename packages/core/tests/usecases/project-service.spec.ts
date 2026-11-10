import { beforeEach, describe, expect, it } from 'bun:test';
import {
  ProjectNameRequiredError,
  ProjectNameTakenError,
  ProjectNotEmptyError,
  ProjectNotFoundError,
} from '../../src/domain/errors';
import { ProjectService } from '../../src/usecases/project-service';
import {
  mockAuditRepo,
  mockProjectRepo,
  type MockAuditRepo,
  type MockProjectRepo,
} from '../helpers/mocks';

const project = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'General',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('ProjectService', () => {
  let projects: MockProjectRepo;
  let audit: MockAuditRepo;
  let service: ProjectService;

  beforeEach(() => {
    projects = mockProjectRepo();
    audit = mockAuditRepo();
    service = new ProjectService({ projects: projects.repo, audit: audit.repo });
  });

  describe('list', () => {
    it('should return projects with their environment counts', async () => {
      projects.listWithCounts.mockResolvedValue([{ ...project(), environmentCount: 3 }]);
      expect(await service.list()).toEqual([{ ...project(), environmentCount: 3 }]);
    });
  });

  describe('create', () => {
    it('should trim the name, create the project and audit it', async () => {
      projects.findByName.mockResolvedValue(null);
      projects.create.mockResolvedValue(project({ id: 2, name: 'Tienda' }));

      const created = await service.create('  Tienda  ');

      expect(projects.create).toHaveBeenCalledWith('Tienda');
      expect(created.name).toBe('Tienda');
      expect(audit.record).toHaveBeenCalledWith(
        'project.created',
        expect.stringContaining('Tienda'),
      );
    });

    it('should reject a name that is already taken', async () => {
      projects.findByName.mockResolvedValue(project({ name: 'tienda' }));
      await expect(service.create('Tienda')).rejects.toThrow(ProjectNameTakenError);
      expect(projects.create).not.toHaveBeenCalled();
    });

    it('should reject blank and over-long names', async () => {
      await expect(service.create('   ')).rejects.toThrow(ProjectNameRequiredError);
      await expect(service.create('x'.repeat(41))).rejects.toThrow(ProjectNameRequiredError);
      expect(projects.findByName).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('should rename and audit the transition', async () => {
      projects.findById.mockResolvedValue(project());
      projects.findByName.mockResolvedValue(null);

      const renamed = await service.rename(1, '  Interno ');

      expect(projects.rename).toHaveBeenCalledWith(1, 'Interno');
      expect(renamed.name).toBe('Interno');
      expect(audit.record).toHaveBeenCalledWith(
        'project.renamed',
        expect.stringContaining('General'),
      );
    });

    it('should allow changing only the letter case of its own name', async () => {
      projects.findById.mockResolvedValue(project());
      projects.findByName.mockResolvedValue(project());
      await service.rename(1, 'GENERAL');
      expect(projects.rename).toHaveBeenCalledWith(1, 'GENERAL');
    });

    it('should reject a name used by another project', async () => {
      projects.findById.mockResolvedValue(project());
      projects.findByName.mockResolvedValue(project({ id: 2, name: 'Tienda' }));
      await expect(service.rename(1, 'Tienda')).rejects.toThrow(ProjectNameTakenError);
      expect(projects.rename).not.toHaveBeenCalled();
    });

    it('should throw ProjectNotFoundError for unknown ids', async () => {
      projects.findById.mockResolvedValue(null);
      await expect(service.rename(9, 'X')).rejects.toThrow(ProjectNotFoundError);
    });
  });

  describe('remove', () => {
    it('should delete an empty project and audit it', async () => {
      projects.findById.mockResolvedValue(project({ id: 2, name: 'Vacío' }));
      projects.countEnvironments.mockResolvedValue(0);

      await service.remove(2);

      expect(projects.delete).toHaveBeenCalledWith(2);
      expect(audit.record).toHaveBeenCalledWith(
        'project.deleted',
        expect.stringContaining('Vacío'),
      );
    });

    it('should refuse to delete a project that still has environments', async () => {
      projects.findById.mockResolvedValue(project());
      projects.countEnvironments.mockResolvedValue(2);
      await expect(service.remove(1)).rejects.toThrow(ProjectNotEmptyError);
      expect(projects.delete).not.toHaveBeenCalled();
    });

    it('should throw ProjectNotFoundError for unknown ids', async () => {
      projects.findById.mockResolvedValue(null);
      await expect(service.remove(9)).rejects.toThrow(ProjectNotFoundError);
    });
  });
});
