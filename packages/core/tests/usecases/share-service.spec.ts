import { beforeEach, describe, expect, it } from 'bun:test';
import { serializeShareEnvelope } from '@secretvault/shared';
import { secretNoteAad, secretValueAad, shareAad } from '../../src/ports/crypto';
import type { ShareImportPlan } from '../../src/domain/entities';
import {
  EnvironmentNotFoundError,
  ProjectNotFoundError,
  SharePackageInvalidError,
  ValidationFailedError,
} from '../../src/domain/errors';
import { ShareService } from '../../src/usecases/share-service';
import {
  mockAuditRepo,
  mockCrypto,
  mockEnvRepo,
  mockProjectRepo,
  mockSecretRepo,
  mockUnitOfWork,
  type MockAuditRepo,
  type MockCrypto,
  type MockEnvRepo,
  type MockProjectRepo,
  type MockSecretRepo,
} from '../helpers/mocks';

const KEY = new Uint8Array(32).fill(5);
const PASSPHRASE = 'correct horse battery';
const SECRET_VALUE = 'postgres://user:hunter2@db/app';
const project = { id: 1, name: 'Checkout', createdAt: new Date(0), updatedAt: new Date(0) };

const environment = (id: number, name: string) => ({
  id,
  projectId: 1,
  name,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const plan = (overrides: Partial<ShareImportPlan> = {}): ShareImportPlan => ({
  passphrase: PASSPHRASE,
  projectId: null,
  separateEnvironments: [],
  overwrite: false,
  ...overrides,
});

describe('ShareService', () => {
  let projects: MockProjectRepo;
  let envs: MockEnvRepo;
  let secrets: MockSecretRepo;
  let crypto: MockCrypto;
  let audit: MockAuditRepo;
  let service: ShareService;

  beforeEach(async () => {
    projects = mockProjectRepo();
    envs = mockEnvRepo();
    secrets = mockSecretRepo();
    crypto = mockCrypto({ strict: true });
    audit = mockAuditRepo();
    service = new ShareService({
      projects: projects.repo,
      environments: envs.repo,
      secrets: secrets.repo,
      crypto: crypto.service,
      audit: audit.repo,
      unitOfWork: mockUnitOfWork(),
    });

    projects.findById.mockResolvedValue(project);
    envs.list.mockResolvedValue([environment(10, 'Local'), environment(11, 'QA')]);
    envs.findById.mockResolvedValue(environment(10, 'Local'));
    secrets.list.mockImplementation(async ({ environmentId }: { environmentId: number }) =>
      environmentId === 10
        ? [
            {
              id: 1,
              environmentId: 10,
              name: 'DATABASE_URL',
              valueEnc: await crypto.service.encrypt(
                KEY,
                SECRET_VALUE,
                secretValueAad(10, 'DATABASE_URL'),
              ),
              noteEnc: await crypto.service.encrypt(
                KEY,
                'rotate monthly',
                secretNoteAad(10, 'DATABASE_URL'),
              ),
            },
          ]
        : [],
    );
  });

  describe('export', () => {
    it('should seal a project without leaving names or values in the clear', async () => {
      const file = await service.exportProject(KEY, 1, PASSPHRASE);

      expect(file.projectName).toBe('Checkout');
      expect(file.environmentName).toBeNull();
      for (const leaked of ['DATABASE_URL', SECRET_VALUE, 'Local', 'Checkout', 'rotate monthly']) {
        expect(file.content).not.toContain(leaked);
      }
    });

    it('should export only the chosen environment', async () => {
      const file = await service.exportEnvironment(KEY, 10, PASSPHRASE);
      const preview = await service.preview(file.content, PASSPHRASE);

      expect(file.environmentName).toBe('Local');
      expect(preview.environments).toEqual([
        { name: 'Local', secretCount: 1, exists: false, conflicts: [] },
      ]);
    });

    it('should audit counts but never values or the passphrase', async () => {
      await service.exportProject(KEY, 1, PASSPHRASE);

      const [type, message] = audit.record.mock.calls[0] as [string, string];
      expect(type).toBe('share.exported');
      expect(message).toContain('2 ambiente(s), 1 secreto(s)');
      expect(message).not.toContain(SECRET_VALUE);
      expect(message).not.toContain(PASSPHRASE);
    });

    it('should reject a passphrase that is too short', async () => {
      await expect(service.exportProject(KEY, 1, 'short')).rejects.toThrow(ValidationFailedError);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('should fail when the project or the environment does not exist', async () => {
      projects.findById.mockResolvedValue(null);
      envs.findById.mockResolvedValue(null);

      await expect(service.exportProject(KEY, 9, PASSPHRASE)).rejects.toThrow(ProjectNotFoundError);
      await expect(service.exportEnvironment(KEY, 9, PASSPHRASE)).rejects.toThrow(
        EnvironmentNotFoundError,
      );
    });
  });

  describe('preview', () => {
    it('should describe the package without storing anything', async () => {
      const file = await service.exportProject(KEY, 1, PASSPHRASE);

      const preview = await service.preview(file.content, PASSPHRASE);

      expect(preview).toEqual({
        projectName: 'Checkout',
        environments: [
          { name: 'Local', secretCount: 1, exists: false, conflicts: [] },
          { name: 'QA', secretCount: 0, exists: false, conflicts: [] },
        ],
        secretCount: 1,
      });
      expect(projects.create).not.toHaveBeenCalled();
    });

    it('should give the same generic error for a wrong passphrase, a tampered file and junk', async () => {
      const { content } = await service.exportProject(KEY, 1, PASSPHRASE);
      const parsed = JSON.parse(content) as { data: string };
      const tampered = JSON.stringify({
        ...parsed,
        data: `${parsed.data.slice(0, -4)}AAAA`,
      });

      for (const [text, passphrase] of [
        [content, 'a different passphrase'],
        [tampered, PASSPHRASE],
        ['not a package', PASSPHRASE],
      ] as const) {
        await expect(service.preview(text, passphrase)).rejects.toThrow(SharePackageInvalidError);
      }
    });

    it('should reject a package whose iteration count was changed, even with the right passphrase', async () => {
      const { content } = await service.exportProject(KEY, 1, PASSPHRASE);
      const parsed = JSON.parse(content) as { iterations: number };
      const downgraded = JSON.stringify({ ...parsed, iterations: parsed.iterations + 1 });

      await expect(service.preview(downgraded, PASSPHRASE)).rejects.toThrow(
        SharePackageInvalidError,
      );
    });
  });

  describe('importPackage into a new project', () => {
    let content: string;

    beforeEach(async () => {
      content = (await service.exportProject(KEY, 1, PASSPHRASE)).content;
      projects.findByName.mockResolvedValue(null);
      projects.create.mockImplementation(async (name: string) => ({ ...project, id: 7, name }));
      envs.create.mockImplementation(async (projectId: number, name: string) => ({
        ...environment(20 + (name === 'QA' ? 1 : 0), name),
        projectId,
      }));
      secrets.create.mockResolvedValue({ id: 99 });
      audit.record.mockClear();
    });

    it('should create the project, its environments and re-encrypt secrets with the new row', async () => {
      const result = await service.importPackage(KEY, content, plan());

      expect(result).toEqual({
        projectId: 7,
        projectName: 'Checkout',
        environmentCount: 2,
        importedCount: 1,
        updatedCount: 0,
        skippedCount: 0,
      });
      const input = secrets.create.mock.calls[0]?.[0] as {
        environmentId: number;
        name: string;
        valueEnc: Uint8Array;
        noteEnc: Uint8Array;
      };
      expect(input.environmentId).toBe(20);
      expect(
        await crypto.service.decrypt(KEY, input.valueEnc, secretValueAad(20, input.name)),
      ).toBe(SECRET_VALUE);
      expect(await crypto.service.decrypt(KEY, input.noteEnc, secretNoteAad(20, input.name))).toBe(
        'rotate monthly',
      );
    });

    it('should add a numeric suffix when the project name already exists', async () => {
      projects.findByName.mockImplementation(async (name: string) =>
        name === 'Checkout' || name === 'Checkout (2)' ? project : null,
      );

      const result = await service.importPackage(KEY, content, plan());

      expect(result.projectName).toBe('Checkout (3)');
    });

    it('should audit only counts', async () => {
      await service.importPackage(KEY, content, plan());

      const [type, message] = audit.record.mock.calls[0] as [string, string];
      expect(type).toBe('share.imported');
      expect(message).toContain('2 ambiente(s), 1 nuevo(s), 0 actualizado(s), 0 omitido(s)');
      expect(message).not.toContain(SECRET_VALUE);
    });

    it('should write nothing when the passphrase is wrong', async () => {
      await expect(
        service.importPackage(KEY, content, plan({ passphrase: 'not the one' })),
      ).rejects.toThrow(SharePackageInvalidError);
      expect(projects.create).not.toHaveBeenCalled();
      expect(secrets.create).not.toHaveBeenCalled();
    });

    it('should reject a correctly sealed package whose content is not valid', async () => {
      const hostile = [
        {
          project: 'P',
          environments: [{ name: 'E', secrets: [{ name: 'bad name', value: 'v' }] }],
        },
        {
          project: 'P',
          environments: [
            {
              name: 'E',
              secrets: [
                { name: 'A', value: '1' },
                { name: 'a', value: '2' },
              ],
            },
          ],
        },
        {
          project: 'P',
          environments: [
            { name: 'E', secrets: [] },
            { name: 'e', secrets: [] },
          ],
        },
        { project: '   ', environments: [] },
        { project: 'x\n[FAKE] vault.unlock', environments: [] },
        { project: 'P', environments: [{ name: 'E\r\nfake', secrets: [] }] },
      ];

      for (const payload of hostile) {
        const salt = crypto.service.generateSalt();
        const shareKey = await crypto.service.deriveKey(PASSPHRASE, salt, 600_000);
        const data = await crypto.service.encrypt(
          shareKey,
          JSON.stringify(payload),
          shareAad(600_000),
        );
        const file = serializeShareEnvelope({ iterations: 600_000, salt, data });

        await expect(service.importPackage(KEY, file, plan())).rejects.toThrow(
          SharePackageInvalidError,
        );
      }
      expect(projects.create).not.toHaveBeenCalled();
    });
  });

  describe('importPackage into an existing project', () => {
    const target = { ...project, id: 5, name: 'Tienda' };
    const localOfTarget = { ...environment(30, 'Local'), projectId: 5 };
    let content: string;

    beforeEach(async () => {
      content = (await service.exportProject(KEY, 1, PASSPHRASE)).content;
      projects.findById.mockResolvedValue(target);
      envs.findByName.mockImplementation(async (projectId: number, name: string) =>
        projectId === 5 && name === 'Local' ? localOfTarget : null,
      );
      envs.create.mockImplementation(async (projectId: number, name: string) => ({
        ...environment(31, name),
        projectId,
      }));
      secrets.findByName.mockResolvedValue(null);
      secrets.create.mockResolvedValue({ id: 99 });
      secrets.update.mockResolvedValue({ id: 1 });
      audit.record.mockClear();
    });

    it('should merge into the environment with the same name and create the missing one', async () => {
      const result = await service.importPackage(KEY, content, plan({ projectId: 5 }));

      expect(result).toEqual({
        projectId: 5,
        projectName: 'Tienda',
        environmentCount: 2,
        importedCount: 1,
        updatedCount: 0,
        skippedCount: 0,
      });
      expect(projects.create).not.toHaveBeenCalled();
      expect(envs.create).toHaveBeenCalledTimes(1);
      expect(envs.create).toHaveBeenCalledWith(5, 'QA');
      const input = secrets.create.mock.calls[0]?.[0] as {
        environmentId: number;
        name: string;
        valueEnc: Uint8Array;
        importedAt: Date;
      };
      expect(input.environmentId).toBe(30);
      expect(input.importedAt).toBeInstanceOf(Date);
      expect(
        await crypto.service.decrypt(KEY, input.valueEnc, secretValueAad(30, input.name)),
      ).toBe(SECRET_VALUE);
    });

    it('should mark every imported secret, also in a brand new project', async () => {
      projects.findByName.mockResolvedValue(null);
      projects.create.mockResolvedValue({ ...project, id: 8 });

      await service.importPackage(KEY, content, plan());

      const input = secrets.create.mock.calls[0]?.[0] as { importedAt: Date };
      expect(input.importedAt).toBeInstanceOf(Date);
    });

    it('should preview which environments exist and which variables would collide', async () => {
      secrets.findByName.mockResolvedValue({ id: 1, name: 'DATABASE_URL' });

      const preview = await service.preview(content, PASSPHRASE, 5);

      expect(preview.environments).toEqual([
        { name: 'Local', secretCount: 1, exists: true, conflicts: ['DATABASE_URL'] },
        { name: 'QA', secretCount: 0, exists: false, conflicts: [] },
      ]);
    });

    it('should skip variables that already exist unless told to overwrite', async () => {
      secrets.findByName.mockResolvedValue({ id: 1, name: 'DATABASE_URL' });

      const result = await service.importPackage(KEY, content, plan({ projectId: 5 }));

      expect(result).toMatchObject({ importedCount: 0, updatedCount: 0, skippedCount: 1 });
      expect(secrets.create).not.toHaveBeenCalled();
      expect(secrets.update).not.toHaveBeenCalled();
    });

    it('should overwrite with the stored name as AAD and mark the secret as imported', async () => {
      secrets.findByName.mockResolvedValue({ id: 1, name: 'database_url' });

      const result = await service.importPackage(
        KEY,
        content,
        plan({ projectId: 5, overwrite: true }),
      );

      expect(result).toMatchObject({ importedCount: 0, updatedCount: 1, skippedCount: 0 });
      const [id, patch] = secrets.update.mock.calls[0] as [
        number,
        { valueEnc: Uint8Array; importedAt: Date },
      ];
      expect(id).toBe(1);
      expect(patch.importedAt).toBeInstanceOf(Date);
      expect(
        await crypto.service.decrypt(KEY, patch.valueEnc, secretValueAad(30, 'database_url')),
      ).toBe(SECRET_VALUE);
    });

    it('should create a separate environment when asked', async () => {
      const result = await service.importPackage(
        KEY,
        content,
        plan({ projectId: 5, separateEnvironments: ['local'] }),
      );

      expect(envs.create).toHaveBeenCalledWith(5, 'Local (2)');
      expect(result.importedCount).toBe(1);
      const input = secrets.create.mock.calls[0]?.[0] as { environmentId: number };
      expect(input.environmentId).toBe(31);
    });

    it('should fail without writing when the target project does not exist', async () => {
      projects.findById.mockResolvedValue(null);

      await expect(service.importPackage(KEY, content, plan({ projectId: 99 }))).rejects.toThrow(
        ProjectNotFoundError,
      );
      expect(envs.create).not.toHaveBeenCalled();
      expect(secrets.create).not.toHaveBeenCalled();
    });
  });
});
