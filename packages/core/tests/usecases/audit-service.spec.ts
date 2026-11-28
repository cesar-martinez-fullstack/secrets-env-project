import { beforeEach, describe, expect, it } from 'bun:test';
import { InvalidMasterPasswordError, ValidationFailedError } from '../../src/domain/errors';
import type { PasswordConfirmer } from '../../src/ports/password-confirmer';
import type { SecuritySettingsRepository } from '../../src/ports/repositories';
import type { SecuritySettings } from '../../src/domain/entities';
import { AuditService } from '../../src/usecases/audit-service';
import { mockAuditRepo, mockUnitOfWork, type MockAuditRepo } from '../helpers/mocks';

describe('AuditService', () => {
  let audit: MockAuditRepo;
  let calls: string[];
  let stored: SecuritySettings;
  let service: AuditService;

  beforeEach(() => {
    audit = mockAuditRepo();
    calls = [];
    stored = {
      auditMaxEvents: 1_000,
      autoLockMinutes: null,
      sessionMaxMinutes: null,
      clipboardClearSeconds: 30,
      logLevel: null,
    };
    const passwords: PasswordConfirmer = {
      confirmPassword: async (sessionId, password) => {
        calls.push(`confirm:${sessionId}`);
        if (password !== 'correcta') throw new InvalidMasterPasswordError();
      },
    };
    const security: SecuritySettingsRepository = {
      get: async () => ({ ...stored }),
      save: async (settings) => {
        calls.push(`save:${settings.auditMaxEvents}`);
        stored = { ...settings };
      },
    };
    audit.prune.mockImplementation(async (max: number) => {
      calls.push(`prune:${max}`);
    });
    audit.clear.mockImplementation(async () => {
      calls.push('clear');
      return 7;
    });
    service = new AuditService({
      audit: audit.repo,
      security,
      passwords,
      unitOfWork: mockUnitOfWork(),
    });
  });

  describe('list', () => {
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

  describe('retention', () => {
    it('should report the stored value and the options that can be chosen', async () => {
      stored = { ...stored, auditMaxEvents: 5_000 };

      expect(await service.retention()).toEqual({
        maxEvents: 5_000,
        options: [500, 1_000, 5_000, 10_000],
      });
    });
  });

  describe('setRetention', () => {
    it('should confirm the password, save, prune at once and audit the change, in that order', async () => {
      audit.count.mockResolvedValueOnce(900).mockResolvedValueOnce(500);

      await service.setRetention('s1', 'correcta', 500);

      expect(calls).toEqual(['confirm:s1', 'save:500', 'prune:500']);
      expect(audit.record).toHaveBeenCalledWith(
        'audit.retention_changed',
        'Retención del historial: de 1000 a 500 eventos (400 eliminados).',
      );
    });

    it('should reject a value that is not one of the options before asking for anything', async () => {
      for (const value of [0, 499, 1_001, 100_000, -5, Number.NaN]) {
        await expect(service.setRetention('s1', 'correcta', value)).rejects.toThrow(
          ValidationFailedError,
        );
      }
      expect(calls).toEqual([]);
    });

    it('should change nothing and audit nothing when the password is wrong', async () => {
      await expect(service.setRetention('s1', 'equivocada', 500)).rejects.toThrow(
        InvalidMasterPasswordError,
      );

      expect(calls).toEqual(['confirm:s1']);
      expect(stored.auditMaxEvents).toBe(1_000);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should confirm the password, wipe the history and leave a first event saying so', async () => {
      const deleted = await service.clear('s1', 'correcta');

      expect(deleted).toBe(7);
      expect(calls).toEqual(['confirm:s1', 'clear']);
      expect(audit.record).toHaveBeenCalledWith(
        'audit.cleared',
        'Historial de auditoría vaciado (7 eventos eliminados).',
      );
    });

    it('should not touch the history when the password is wrong', async () => {
      await expect(service.clear('s1', 'equivocada')).rejects.toThrow(InvalidMasterPasswordError);

      expect(calls).toEqual(['confirm:s1']);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
