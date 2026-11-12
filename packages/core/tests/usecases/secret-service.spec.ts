/**
 * Tests unitarios de SecretService: CRUD enmascarado, reveal auditado,
 * importación masiva y exportación.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { secretNoteAad, secretValueAad } from '../../src/ports/crypto';
import {
  EnvironmentNotFoundError,
  SecretNameInvalidError,
  SecretNameTakenError,
  SecretNotFoundError,
  SecretValueRequiredError,
  ValidationFailedError,
} from '../../src/domain/errors';
import { SecretService } from '../../src/usecases/secret-service';
import {
  mockAuditRepo,
  mockCrypto,
  mockEnvRepo,
  mockSecretRepo,
  mockUnitOfWork,
  type MockAuditRepo,
  type MockCrypto,
  type MockEnvRepo,
  type MockSecretRepo,
} from '../helpers/mocks';

const KEY = new Uint8Array(32).fill(5);

function secretWithMeta(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    environmentId: 1,
    environmentName: 'Local',
    projectName: 'General',
    name: 'DATABASE_URL',
    valueEnc: new TextEncoder().encode('enc:postgres://x'),
    noteEnc: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

describe('SecretService', () => {
  let secrets: MockSecretRepo;
  let envs: MockEnvRepo;
  let crypto: MockCrypto;
  let audit: MockAuditRepo;
  let service: SecretService;

  beforeEach(() => {
    secrets = mockSecretRepo();
    envs = mockEnvRepo();
    crypto = mockCrypto();
    audit = mockAuditRepo();
    service = new SecretService({
      secrets: secrets.repo,
      environments: envs.repo,
      crypto: crypto.service,
      audit: audit.repo,
      unitOfWork: mockUnitOfWork(),
    });
  });

  describe('list', () => {
    it('should always return masked values — never the plaintext', async () => {
      secrets.list.mockResolvedValue([
        secretWithMeta(),
        secretWithMeta({ id: 2, name: 'API_KEY' }),
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
      for (const item of result) {
        expect(item.maskedValue).toBe('••••••••');
        expect(Object.values(item)).not.toContain('postgres://x');
      }
    });

    it('should forward trimmed queries and skip empty ones', async () => {
      secrets.list.mockResolvedValue([]);
      await service.list({ query: '  db_  ' });
      expect(secrets.list).toHaveBeenCalledWith({ query: 'db_' });

      secrets.list.mockClear();
      await service.list({ query: '   ' });
      expect(secrets.list).toHaveBeenCalledWith({ query: undefined });
    });

    it('should flag hasNote based on the encrypted note presence', async () => {
      secrets.list.mockResolvedValue([secretWithMeta({ noteEnc: new Uint8Array(8) })]);
      const [item] = await service.list();
      expect(item?.hasNote).toBe(true);
    });
  });

  describe('reveal', () => {
    it('should decrypt the value and the note, and audit the access', async () => {
      secrets.findById.mockResolvedValue(
        secretWithMeta({ noteEnc: new TextEncoder().encode('enc:BD principal') }),
      );

      const secret = await service.reveal(KEY, 1);

      expect(secret.value).toBe('postgres://x');
      expect(secret.note).toBe('BD principal');
      expect(crypto.decrypt).toHaveBeenCalledWith(
        KEY,
        expect.any(Uint8Array),
        secretValueAad(1, 'DATABASE_URL'),
      );
      expect(crypto.decrypt).toHaveBeenCalledWith(
        KEY,
        expect.any(Uint8Array),
        secretNoteAad(1, 'DATABASE_URL'),
      );
      expect(audit.record).toHaveBeenCalledWith(
        'secret.revealed',
        expect.stringContaining('DATABASE_URL'),
      );
    });

    it('should throw SecretNotFoundError for unknown ids', async () => {
      secrets.findById.mockResolvedValue(null);
      await expect(service.reveal(KEY, 99)).rejects.toThrow(SecretNotFoundError);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should encrypt with the secret AAD and audit the creation', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'Local',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findByName.mockResolvedValue(null);
      secrets.create.mockResolvedValue({
        id: 7,
        environmentId: 1,
        name: 'NEW_KEY',
        valueEnc: new Uint8Array(4),
        noteEnc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findById.mockResolvedValue(secretWithMeta({ id: 7, name: 'NEW_KEY' }));

      await service.create(KEY, { environmentId: 1, name: 'NEW_KEY', value: 's3cr3t' });

      expect(crypto.encrypt).toHaveBeenCalledWith(KEY, 's3cr3t', secretValueAad(1, 'NEW_KEY'));
      expect(secrets.create).toHaveBeenCalledWith({
        environmentId: 1,
        name: 'NEW_KEY',
        valueEnc: expect.any(Uint8Array),
        noteEnc: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        'secret.created',
        expect.stringContaining('NEW_KEY'),
      );
    });

    it('should encrypt non-empty notes with the note AAD', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'Local',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findByName.mockResolvedValue(null);
      secrets.create.mockResolvedValue({
        id: 7,
        environmentId: 1,
        name: 'NEW_KEY',
        valueEnc: new Uint8Array(4),
        noteEnc: new Uint8Array(4),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findById.mockResolvedValue(secretWithMeta({ id: 7, name: 'NEW_KEY' }));

      await service.create(KEY, {
        environmentId: 1,
        name: 'NEW_KEY',
        value: 'v',
        note: '  nota  ',
      });

      expect(crypto.encrypt).toHaveBeenCalledWith(KEY, 'nota', secretNoteAad(1, 'NEW_KEY'));
    });

    it('should reject duplicates case-insensitively without encrypting', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'Local',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findByName.mockResolvedValue({
        id: 1,
        environmentId: 1,
        name: 'database_url',
        valueEnc: new Uint8Array(4),
        noteEnc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.create(KEY, { environmentId: 1, name: 'DATABASE_URL', value: 'x' }),
      ).rejects.toThrow(SecretNameTakenError);
      expect(crypto.encrypt).not.toHaveBeenCalled();
      expect(secrets.create).not.toHaveBeenCalled();
    });

    it('should reject invalid names and empty values before hitting the repository', async () => {
      await expect(
        service.create(KEY, { environmentId: 1, name: '1MALFORMADO', value: 'v' }),
      ).rejects.toThrow(SecretNameInvalidError);
      await expect(
        service.create(KEY, { environmentId: 1, name: 'OK_NAME', value: '' }),
      ).rejects.toThrow(SecretValueRequiredError);
      expect(secrets.create).not.toHaveBeenCalled();
    });

    it('should throw EnvironmentNotFoundError for unknown environments', async () => {
      envs.findById.mockResolvedValue(null);
      await expect(
        service.create(KEY, { environmentId: 42, name: 'A_KEY', value: 'v' }),
      ).rejects.toThrow(EnvironmentNotFoundError);
    });
  });

  describe('update', () => {
    it('should re-encrypt only the fields that changed', async () => {
      secrets.findById
        .mockResolvedValueOnce(secretWithMeta()) // lectura inicial
        .mockResolvedValueOnce(secretWithMeta({ name: 'RENAMED_KEY' })); // lectura final
      secrets.findByName.mockResolvedValue(null);

      await service.update(KEY, 1, { name: 'RENAMED_KEY', value: 'nuevo-valor' });

      expect(crypto.encrypt).toHaveBeenCalledTimes(1);
      expect(crypto.encrypt).toHaveBeenCalledWith(
        KEY,
        'nuevo-valor',
        secretValueAad(1, 'RENAMED_KEY'),
      );
      expect(secrets.update).toHaveBeenCalledWith(1, {
        name: 'RENAMED_KEY',
        valueEnc: expect.any(Uint8Array),
        noteEnc: undefined,
        importedAt: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        'secret.updated',
        expect.stringContaining('RENAMED_KEY'),
      );
    });

    it('should drop the imported mark when the value is edited', async () => {
      secrets.findById.mockResolvedValue(secretWithMeta({ importedAt: new Date('2024-02-01') }));

      await service.update(KEY, 1, { value: 'mio' });

      expect(secrets.update).toHaveBeenCalledWith(1, expect.objectContaining({ importedAt: null }));
    });

    it('should keep the imported mark when only the note or the name changes', async () => {
      secrets.findById.mockResolvedValue(secretWithMeta({ importedAt: new Date('2024-02-01') }));
      secrets.findByName.mockResolvedValue(null);

      await service.update(KEY, 1, { note: 'una nota' });
      await service.update(KEY, 1, { name: 'OTHER_KEY' });

      for (const call of secrets.update.mock.calls) {
        expect((call[1] as { importedAt?: Date | null }).importedAt).toBeUndefined();
      }
    });

    it('should clear the note when null is sent', async () => {
      secrets.findById
        .mockResolvedValueOnce(secretWithMeta({ noteEnc: new Uint8Array(4) }))
        .mockResolvedValueOnce(secretWithMeta());
      secrets.findByName.mockResolvedValue(null);

      await service.update(KEY, 1, { note: null });

      expect(secrets.update).toHaveBeenCalledWith(1, {
        name: undefined,
        valueEnc: undefined,
        noteEnc: null,
      });
    });

    it('should reject renaming to an existing sibling name', async () => {
      secrets.findById.mockResolvedValue(secretWithMeta({ id: 1 }));
      secrets.findByName.mockResolvedValue(secretWithMeta({ id: 2, name: 'TAKEN' }));

      await expect(service.update(KEY, 1, { name: 'TAKEN' })).rejects.toThrow(SecretNameTakenError);
      expect(secrets.update).not.toHaveBeenCalled();
    });

    it('should reject empty replacement values', async () => {
      secrets.findById.mockResolvedValue(secretWithMeta());
      await expect(service.update(KEY, 1, { value: '' })).rejects.toThrow(SecretValueRequiredError);
    });
  });

  describe('remove', () => {
    it('should audit the deletion with the environment name', async () => {
      secrets.findById.mockResolvedValue(secretWithMeta());
      await service.remove(1);
      expect(secrets.delete).toHaveBeenCalledWith(1);
      expect(audit.record).toHaveBeenCalledWith('secret.deleted', expect.stringContaining('Local'));
    });

    it('should throw SecretNotFoundError when the id does not exist', async () => {
      secrets.findById.mockResolvedValue(null);
      await expect(service.remove(404)).rejects.toThrow(SecretNotFoundError);
      expect(secrets.delete).not.toHaveBeenCalled();
    });
  });

  describe('removeMany', () => {
    it('should delete every secret once and audit a single event with the names', async () => {
      secrets.findById.mockImplementation(async (id: number) =>
        secretWithMeta({ id, name: `KEY_${id}` }),
      );

      const deleted = await service.removeMany([1, 2, 2, 3]);

      expect(deleted).toBe(3);
      expect(secrets.delete).toHaveBeenCalledTimes(3);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        'secret.deleted',
        '3 secretos eliminados: «KEY_1», «KEY_2», «KEY_3».',
      );
    });

    it('should cap the names listed in the audit message', async () => {
      secrets.findById.mockImplementation(async (id: number) =>
        secretWithMeta({ id, name: `KEY_${id}` }),
      );
      const ids = Array.from({ length: 12 }, (_, index) => index + 1);

      await service.removeMany(ids);

      expect(audit.record).toHaveBeenCalledWith(
        'secret.deleted',
        expect.stringContaining('y 2 más'),
      );
    });

    it('should throw SecretNotFoundError and audit nothing when one id is missing', async () => {
      secrets.findById.mockImplementation(async (id: number) =>
        id === 2 ? null : secretWithMeta({ id }),
      );

      await expect(service.removeMany([1, 2])).rejects.toThrow(SecretNotFoundError);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('should reject an empty list and a list above the limit', async () => {
      const tooMany = Array.from({ length: 201 }, (_, index) => index + 1);

      await expect(service.removeMany([])).rejects.toThrow(ValidationFailedError);
      await expect(service.removeMany(tooMany)).rejects.toThrow(ValidationFailedError);
      expect(secrets.delete).not.toHaveBeenCalled();
    });
  });

  describe('import', () => {
    it('should create new entries and count invalid lines', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'QA',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findByName.mockResolvedValue(null);
      secrets.create.mockResolvedValue({
        id: 1,
        environmentId: 1,
        name: 'X',
        valueEnc: new Uint8Array(4),
        noteEnc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.import(KEY, 1, 'A=1\nB=2\nMALFORMADA\n', false);

      expect(result).toEqual({ imported: 2, updated: 0, skipped: 0, invalidLines: 1 });
      expect(secrets.create).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith('secret.imported', expect.stringContaining('QA'));
    });

    it('should skip existing entries unless overwrite is enabled', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'QA',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findByName.mockResolvedValue({
        id: 1,
        environmentId: 1,
        name: 'A',
        valueEnc: new Uint8Array(4),
        noteEnc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const skipped = await service.import(KEY, 1, 'A=nuevo', false);
      expect(skipped).toEqual({ imported: 0, updated: 0, skipped: 1, invalidLines: 0 });
      expect(secrets.update).not.toHaveBeenCalled();

      const overwritten = await service.import(KEY, 1, 'A=nuevo', true);
      expect(overwritten.updated).toBe(1);
      expect(secrets.update).toHaveBeenCalledWith(1, { valueEnc: expect.any(Uint8Array) });
      expect(crypto.encrypt).toHaveBeenCalledWith(KEY, 'nuevo', secretValueAad(1, 'A'));
    });

    it('should throw EnvironmentNotFoundError for unknown environments', async () => {
      envs.findById.mockResolvedValue(null);
      await expect(service.import(KEY, 99, 'A=1', false)).rejects.toThrow(EnvironmentNotFoundError);
    });

    it('should not audit when nothing was imported or updated', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'QA',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.findByName.mockResolvedValue({
        id: 1,
        environmentId: 1,
        name: 'A',
        valueEnc: new Uint8Array(4),
        noteEnc: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.import(KEY, 1, 'A=mismo', false);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('exportEntries', () => {
    it('should decrypt every secret of the environment and audit the export', async () => {
      envs.findById.mockResolvedValue({
        id: 1,
        name: 'Local',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      secrets.list.mockResolvedValue([
        secretWithMeta(),
        secretWithMeta({ id: 2, name: 'API_KEY', noteEnc: new TextEncoder().encode('enc:nota') }),
      ]);

      const { entries, environmentName } = await service.exportEntries(KEY, 1, 'pdf');

      expect(environmentName).toBe('Local');
      expect(entries).toEqual([
        { name: 'DATABASE_URL', value: 'postgres://x', note: null },
        { name: 'API_KEY', value: 'postgres://x', note: 'nota' },
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        'secret.exported',
        expect.stringContaining('(formato pdf)'),
      );
    });

    it('should throw EnvironmentNotFoundError for unknown environments', async () => {
      envs.findById.mockResolvedValue(null);
      await expect(service.exportEntries(KEY, 99, 'env')).rejects.toThrow(EnvironmentNotFoundError);
    });
  });
});
