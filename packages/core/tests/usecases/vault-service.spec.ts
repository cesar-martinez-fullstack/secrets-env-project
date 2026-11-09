/**
 * Tests unitarios de VaultService (casos de uso de la bóveda).
 * La lógica de setup/unlock/lock/rotación se valida con repos mockeados;
 * la criptografía real se cubre en packages/crypto y la integración en apps/api.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { AAD_VERIFIER, VERIFIER_PLAINTEXT } from '../../src/ports/crypto';
import {
  InvalidMasterPasswordError,
  VaultAlreadyInitializedError,
  VaultLockedError,
  VaultNotInitializedError,
  WeakMasterPasswordError,
} from '../../src/domain/errors';
import { VaultService } from '../../src/usecases/vault-service';
import {
  mockAuditRepo,
  mockCrypto,
  mockEnvRepo,
  mockSecretRepo,
  mockSessions,
  mockUnitOfWork,
  mockVaultRepo,
  type MockAuditRepo,
  type MockCrypto,
  type MockEnvRepo,
  type MockSecretRepo,
  type MockSessions,
  type MockVaultRepo,
} from '../helpers/mocks';

const PASSWORD = 'MiClaveMaestra!';

describe('VaultService', () => {
  let vault: MockVaultRepo;
  let envs: MockEnvRepo;
  let secrets: MockSecretRepo;
  let crypto: MockCrypto;
  let sessions: MockSessions;
  let audit: MockAuditRepo;
  let service: VaultService;

  beforeEach(() => {
    vault = mockVaultRepo();
    envs = mockEnvRepo();
    secrets = mockSecretRepo();
    crypto = mockCrypto();
    sessions = mockSessions();
    audit = mockAuditRepo();
    envs.list.mockResolvedValue([]);
    service = new VaultService({
      vaultRepo: vault.repo,
      environments: envs.repo,
      secrets: secrets.repo,
      crypto: crypto.service,
      sessions: sessions.store,
      audit: audit.repo,
      unitOfWork: mockUnitOfWork(),
      config: { iterations: 310_000, autoLockMinutes: 15 },
    });
  });

  describe('status', () => {
    it('should report not initialized when there is no vault record', async () => {
      vault.get.mockResolvedValue(null);
      const status = await service.status();
      expect(status.initialized).toBe(false);
      expect(status.pbkdf2Iterations).toBe(310_000);
    });

    it('should report initialized with the stored iterations', async () => {
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 500_000,
        verifier: new Uint8Array(8),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const status = await service.status();
      expect(status.initialized).toBe(true);
      expect(status.pbkdf2Iterations).toBe(500_000);
    });
  });

  describe('setup', () => {
    it('should reject weak passwords before touching the vault', async () => {
      await expect(service.setup('corta')).rejects.toThrow(WeakMasterPasswordError);
      expect(vault.get).not.toHaveBeenCalled();
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should reject setup when the vault already exists', async () => {
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new Uint8Array(8),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(service.setup(PASSWORD)).rejects.toThrow(VaultAlreadyInitializedError);
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should derive the key, encrypt the verifier and persist the vault', async () => {
      sessions.create.mockResolvedValue({
        sessionId: 's1',
        key: new Uint8Array(32),
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      await service.setup(PASSWORD);

      expect(crypto.generateSalt).toHaveBeenCalledTimes(1);
      expect(crypto.deriveKey).toHaveBeenCalledWith(PASSWORD, expect.any(Uint8Array), 310_000);
      expect(crypto.encrypt).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        VERIFIER_PLAINTEXT,
        AAD_VERIFIER,
      );
      expect(vault.save).toHaveBeenCalledTimes(1);
      expect(envs.create).toHaveBeenCalledWith('Local'); // ambiente por defecto
      expect(audit.record).toHaveBeenCalledWith('vault.setup', expect.any(String));
      expect(sessions.create).toHaveBeenCalledWith(expect.any(Uint8Array), 15);
    });

    it('should not create the default environment if one already exists', async () => {
      envs.list.mockResolvedValue([
        { id: 1, name: 'QA', createdAt: new Date(), updatedAt: new Date() },
      ]);
      sessions.create.mockResolvedValue({
        sessionId: 's1',
        key: new Uint8Array(32),
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      await service.setup(PASSWORD);

      expect(envs.create).not.toHaveBeenCalled();
    });
  });

  describe('unlock', () => {
    it('should reject when the vault is not initialized', async () => {
      vault.get.mockResolvedValue(null);
      await expect(service.unlock(PASSWORD)).rejects.toThrow(VaultNotInitializedError);
    });

    it('should create a session and audit the unlock on success', async () => {
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16).fill(9),
        iterations: 310_000,
        verifier: new TextEncoder().encode(`enc:${VERIFIER_PLAINTEXT}`),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      sessions.create.mockResolvedValue({
        sessionId: 's1',
        key: new Uint8Array(32),
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      const session = await service.unlock(PASSWORD);

      expect(session.sessionId).toBe('s1');
      expect(crypto.deriveKey).toHaveBeenCalledWith(PASSWORD, expect.any(Uint8Array), 310_000);
      expect(crypto.decrypt).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(Uint8Array),
        AAD_VERIFIER,
      );
      expect(audit.record).toHaveBeenCalledWith('vault.unlock', expect.any(String));
      expect(sessions.purgeExpired).toHaveBeenCalledTimes(1); // purga de auto-lock
    });

    it('should record a failed attempt and throw InvalidMasterPasswordError when the verifier does not decrypt', async () => {
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new TextEncoder().encode('enc:otra-cosa'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      crypto.decrypt.mockRejectedValue(new Error('decrypt failed'));

      await expect(service.unlock('Incorrecta99!')).rejects.toThrow(InvalidMasterPasswordError);
      expect(audit.record).toHaveBeenCalledWith('vault.unlock_failed', expect.any(String));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('should not leak the verifier plaintext mismatch as a generic failure', async () => {
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new TextEncoder().encode('enc:contenido-inesperado'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.unlock(PASSWORD)).rejects.toThrow(InvalidMasterPasswordError);
    });
  });

  describe('lock', () => {
    it('should remove the session and audit when it existed', async () => {
      sessions.get.mockResolvedValue({
        sessionId: 's1',
        key: new Uint8Array(32),
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      const locked = await service.lock('s1');

      expect(locked).toBe(true);
      expect(sessions.remove).toHaveBeenCalledWith('s1');
      expect(audit.record).toHaveBeenCalledWith('vault.lock', expect.any(String));
    });

    it('should be a no-op without a session', async () => {
      expect(await service.lock(undefined)).toBe(false);
      expect(sessions.remove).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('changeMasterPassword', () => {
    function seedSession() {
      sessions.get.mockResolvedValue({
        sessionId: 's1',
        key: new Uint8Array(32).fill(1),
        createdAt: new Date(),
        expiresAt: new Date(),
      });
    }

    it('should throw VaultLockedError without an active session', async () => {
      sessions.get.mockResolvedValue(null);
      await expect(service.changeMasterPassword('s1', 'a', 'b')).rejects.toThrow(VaultLockedError);
    });

    it('should verify the current password against the verifier before rotating', async () => {
      seedSession();
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new TextEncoder().encode('enc:otro-texto'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.changeMasterPassword('s1', PASSWORD, 'NuevaClave99!')).rejects.toThrow(
        InvalidMasterPasswordError,
      );
      expect(secrets.list).not.toHaveBeenCalled();
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should reject weak new passwords', async () => {
      seedSession();
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new TextEncoder().encode(`enc:${VERIFIER_PLAINTEXT}`),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.changeMasterPassword('s1', PASSWORD, 'corta')).rejects.toThrow(
        WeakMasterPasswordError,
      );
      expect(secrets.update).not.toHaveBeenCalled();
    });

    it('should re-encrypt every secret (value and note) with the new key', async () => {
      seedSession();
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new TextEncoder().encode(`enc:${VERIFIER_PLAINTEXT}`),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
      });
      secrets.list.mockResolvedValue([
        {
          id: 1,
          environmentId: 1,
          environmentName: 'Local',
          name: 'A',
          valueEnc: new TextEncoder().encode('enc:valor-a'),
          noteEnc: new TextEncoder().encode('enc:nota-a'),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          environmentId: 1,
          environmentName: 'Local',
          name: 'B',
          valueEnc: new TextEncoder().encode('enc:valor-b'),
          noteEnc: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      sessions.rotateKey.mockResolvedValue(null);

      await service.changeMasterPassword('s1', PASSWORD, 'NuevaClave99!');

      // Re-encriptados con la clave NUEVA: 2 valores + 1 nota + 1 verificador nuevo.
      expect(crypto.encrypt).toHaveBeenCalledTimes(4);
      expect(crypto.encrypt).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'valor-a',
        expect.any(String),
      );
      expect(crypto.encrypt).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'valor-b',
        expect.any(String),
      );
      expect(secrets.update).toHaveBeenCalledTimes(2);
      expect(vault.save).toHaveBeenCalledWith(
        expect.objectContaining({ iterations: 310_000, createdAt: new Date('2024-01-01') }),
      );
      expect(sessions.rotateKey).toHaveBeenCalledWith('s1', expect.any(Uint8Array));
      expect(audit.record).toHaveBeenCalledWith(
        'vault.password_changed',
        expect.stringContaining('2 secreto(s)'),
      );
    });

    it('should preserve the createdAt of the original vault', async () => {
      seedSession();
      const original = new Date('2024-01-01T00:00:00Z');
      vault.get.mockResolvedValue({
        salt: new Uint8Array(16),
        iterations: 310_000,
        verifier: new TextEncoder().encode(`enc:${VERIFIER_PLAINTEXT}`),
        createdAt: original,
        updatedAt: new Date(),
      });
      secrets.list.mockResolvedValue([]);

      await service.changeMasterPassword('s1', PASSWORD, 'NuevaClave99!');

      expect(vault.save).toHaveBeenCalledWith(expect.objectContaining({ createdAt: original }));
    });
  });
});
