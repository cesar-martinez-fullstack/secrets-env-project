import { beforeEach, describe, expect, it } from 'bun:test';
import { InvalidMasterPasswordError, VaultLockedError } from '../../src/domain/errors';
import { BackupService, type PasswordConfirmer } from '../../src/usecases/backup-service';
import { mockAuditRepo, type MockAuditRepo } from '../helpers/mocks';

const NOW = new Date('2026-11-25T12:00:00Z');
const SNAPSHOT = new Uint8Array([1, 2, 3, 4, 5]);

describe('BackupService', () => {
  let audit: MockAuditRepo;
  let calls: string[];
  let passwords: PasswordConfirmer;
  let service: BackupService;

  beforeEach(() => {
    audit = mockAuditRepo();
    calls = [];
    passwords = {
      confirmPassword: async (sessionId, password) => {
        calls.push(`confirm:${sessionId}`);
        if (password !== 'correcta') throw new InvalidMasterPasswordError();
      },
    };
    service = new BackupService({
      passwords,
      backup: {
        snapshot: async () => {
          calls.push('snapshot');
          return SNAPSHOT;
        },
      },
      audit: audit.repo,
      now: () => NOW,
    });
  });

  it('should confirm the password before taking the snapshot and return the bytes', async () => {
    const file = await service.create('s1', 'correcta');

    expect(calls).toEqual(['confirm:s1', 'snapshot']);
    expect(file).toEqual({ bytes: SNAPSHOT, createdAt: NOW });
  });

  it('should audit the backup with its size and nothing else', async () => {
    await service.create('s1', 'correcta');

    expect(audit.record).toHaveBeenCalledWith(
      'vault.backup_created',
      'Copia de seguridad generada (5 bytes).',
    );
  });

  it('should not take a snapshot nor audit when the password is wrong', async () => {
    await expect(service.create('s1', 'equivocada')).rejects.toThrow(InvalidMasterPasswordError);

    expect(calls).toEqual(['confirm:s1']);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('should let a locked session through as the confirmation error', async () => {
    passwords.confirmPassword = async () => {
      throw new VaultLockedError();
    };

    await expect(service.create('s1', 'correcta')).rejects.toThrow(VaultLockedError);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
