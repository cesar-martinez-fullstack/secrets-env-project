import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { InvalidMasterPasswordError, ValidationFailedError } from '../../src/domain/errors';
import { SessionSecurityService } from '../../src/usecases/session-security-service';
import {
  mockAuditRepo,
  mockSecurityRepo,
  mockSessions,
  mockUnitOfWork,
  type MockAuditRepo,
  type MockSecurityRepo,
  type MockSessions,
} from '../helpers/mocks';

const stored = (overrides: Record<string, unknown> = {}) => ({
  auditMaxEvents: 1000,
  autoLockMinutes: null,
  sessionMaxMinutes: null,
  clipboardClearSeconds: 30,
  ...overrides,
});

const change = (overrides: Record<string, unknown> = {}) => ({
  autoLockMinutes: 5,
  sessionMaxMinutes: 60,
  clipboardClearSeconds: 60,
  ...overrides,
});

describe('SessionSecurityService', () => {
  let security: MockSecurityRepo;
  let sessions: MockSessions;
  let audit: MockAuditRepo;
  let confirmPassword: ReturnType<typeof jest.fn>;
  let service: SessionSecurityService;
  const attempt = 'texto-de-prueba';

  beforeEach(() => {
    security = mockSecurityRepo();
    sessions = mockSessions();
    audit = mockAuditRepo();
    confirmPassword = jest.fn();
    security.get.mockResolvedValue(stored());
    service = new SessionSecurityService({
      security: security.repo,
      sessions: sessions.store,
      passwords: { confirmPassword },
      audit: audit.repo,
      unitOfWork: mockUnitOfWork(),
      defaults: { autoLockMinutes: 20, sessionMaxMinutes: 720 },
    });
  });

  it('should use the configured defaults while nothing was saved', async () => {
    expect(await service.settings()).toEqual({
      autoLockMinutes: 20,
      sessionMaxMinutes: 720,
      clipboardClearSeconds: 30,
    });
    expect(await service.currentLimits()).toEqual({ idleMinutes: 20, maxMinutes: 720 });
  });

  it('should let saved values take precedence over the defaults', async () => {
    security.get.mockResolvedValue(stored({ autoLockMinutes: 60, sessionMaxMinutes: 240 }));
    expect(await service.currentLimits()).toEqual({ idleMinutes: 60, maxMinutes: 240 });
  });

  it('should save, audit old and new values and apply the limits to open sessions', async () => {
    await service.update('sid', attempt, change());

    expect(confirmPassword).toHaveBeenCalledWith('sid', attempt);
    expect(security.save).toHaveBeenCalledWith(stored(change()));
    expect(sessions.applyLimits).toHaveBeenCalledWith({ idleMinutes: 5, maxMinutes: 60 });
    expect(audit.record).toHaveBeenCalledWith(
      'security.settings_changed',
      'Ajustes de sesión: bloqueo 20 → 5 min, duración máxima 720 → 60 min, portapapeles 30 → 60 s.',
    );
  });

  it('should change nothing when the password is wrong', async () => {
    confirmPassword.mockRejectedValue(new InvalidMasterPasswordError());
    await expect(service.update('sid', attempt, change())).rejects.toThrow(
      InvalidMasterPasswordError,
    );
    expect(security.save).not.toHaveBeenCalled();
    expect(sessions.applyLimits).not.toHaveBeenCalled();
  });

  it.each([
    ['autoLockMinutes', 0],
    ['autoLockMinutes', 1440],
    ['sessionMaxMinutes', 10080],
    ['clipboardClearSeconds', 5],
  ])('should reject %s = %d before asking for the password', async (field, value) => {
    await expect(service.update('sid', attempt, change({ [field]: value }))).rejects.toThrow(
      ValidationFailedError,
    );
    expect(confirmPassword).not.toHaveBeenCalled();
  });

  it('should accept keeping a configured value that is not one of the options', async () => {
    await service.update('sid', attempt, change({ autoLockMinutes: 20 }));
    expect(security.save).toHaveBeenCalled();
  });
});
