import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { InvalidMasterPasswordError, ValidationFailedError } from '../../src/domain/errors';
import { LogLevelService } from '../../src/usecases/log-level-service';
import {
  mockAuditRepo,
  mockSecurityRepo,
  mockUnitOfWork,
  type MockAuditRepo,
  type MockSecurityRepo,
} from '../helpers/mocks';

describe('LogLevelService', () => {
  let security: MockSecurityRepo;
  let audit: MockAuditRepo;
  let confirmPassword: ReturnType<typeof jest.fn>;
  let setLevel: ReturnType<typeof jest.fn>;
  let service: LogLevelService;
  const attempt = 'texto-de-prueba';
  const saved = (logLevel: string | null) => ({ auditMaxEvents: 1000, logLevel });

  beforeEach(() => {
    security = mockSecurityRepo();
    audit = mockAuditRepo();
    confirmPassword = jest.fn();
    setLevel = jest.fn();
    security.get.mockResolvedValue(saved(null));
    service = new LogLevelService({
      security: security.repo,
      audit: audit.repo,
      passwords: { confirmPassword },
      unitOfWork: mockUnitOfWork(),
      output: { setLevel },
      defaultLevel: 'info',
    });
  });

  it('should use the configured level until one is saved', async () => {
    expect(await service.current()).toBe('info');
    security.get.mockResolvedValue(saved('debug'));
    expect(await service.current()).toBe('debug');
  });

  it('should apply the stored level on load', async () => {
    security.get.mockResolvedValue(saved('warn'));
    await service.load();
    expect(setLevel).toHaveBeenCalledWith('warn');
  });

  it('should confirm the password, save, audit and apply', async () => {
    await service.change('sid', attempt, 'debug');

    expect(confirmPassword).toHaveBeenCalledWith('sid', attempt);
    expect(security.save).toHaveBeenCalledWith(saved('debug'));
    expect(audit.record).toHaveBeenCalledWith(
      'security.settings_changed',
      'Nivel de registro: info → debug.',
    );
    expect(setLevel).toHaveBeenCalledWith('debug');
  });

  it('should change nothing with a wrong password', async () => {
    confirmPassword.mockRejectedValue(new InvalidMasterPasswordError());
    await expect(service.change('sid', attempt, 'error')).rejects.toThrow(
      InvalidMasterPasswordError,
    );
    expect(security.save).not.toHaveBeenCalled();
    expect(setLevel).not.toHaveBeenCalled();
  });

  it('should reject an unknown level before asking for the password', async () => {
    await expect(service.change('sid', attempt, 'silent')).rejects.toThrow(ValidationFailedError);
    expect(confirmPassword).not.toHaveBeenCalled();
  });
});
