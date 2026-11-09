/**
 * Tests unitarios de VaultService con cifrado de envoltura (DEK + clave de recuperación).
 *
 * Se usa el crypto simulado en modo ESTRICTO (simula la autenticación de GCM): una contraseña o
 * una clave de recuperación equivocadas realmente fallan al desenvolver la DEK. La criptografía
 * real se cubre en packages/crypto y el flujo completo en apps/api.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { decodeRecoveryKey } from '@secretvault/shared';
import { AAD_DEK_RECOVERY, AAD_VERIFIER, VERIFIER_PLAINTEXT } from '../../src/ports/crypto';
import type { VaultInfo, VaultSession } from '../../src/domain/entities';
import {
  InvalidMasterPasswordError,
  InvalidRecoveryKeyError,
  RecoveryNotAvailableError,
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
  mockSessions,
  mockUnitOfWork,
  mockVaultRepo,
  type MockAuditRepo,
  type MockCrypto,
  type MockEnvRepo,
  type MockSessions,
  type MockVaultRepo,
} from '../helpers/mocks';

const PASSWORD = 'MiClaveMaestra!';
const NEW_PASSWORD = 'OtraClaveMuyLarga#2';
const RECOVERY_FORMAT = /^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/;

describe('VaultService', () => {
  let vault: MockVaultRepo;
  let envs: MockEnvRepo;
  let crypto: MockCrypto;
  let sessions: MockSessions;
  let audit: MockAuditRepo;
  let service: VaultService;
  let stored: VaultInfo | null;
  let activeSession: VaultSession | null;

  beforeEach(() => {
    vault = mockVaultRepo();
    envs = mockEnvRepo();
    crypto = mockCrypto({ strict: true });
    sessions = mockSessions();
    audit = mockAuditRepo();
    stored = null;
    activeSession = null;

    // Repositorio con estado: lo guardado por `save` es lo que devuelve `get`.
    vault.get.mockImplementation(async () => stored);
    vault.save.mockImplementation(async (info: VaultInfo) => {
      stored = info;
    });
    envs.list.mockResolvedValue([]);
    sessions.create.mockImplementation(async (key: Uint8Array) => {
      activeSession = {
        sessionId: 's1',
        key,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      };
      return activeSession;
    });
    sessions.get.mockImplementation(async (id: string) =>
      activeSession && activeSession.sessionId === id ? activeSession : null,
    );

    service = new VaultService({
      vaultRepo: vault.repo,
      environments: envs.repo,
      crypto: crypto.service,
      sessions: sessions.store,
      audit: audit.repo,
      unitOfWork: mockUnitOfWork(),
      config: { iterations: 600_000, autoLockMinutes: 15 },
    });
  });

  /** Crea una bóveda de formato 2 por el camino real (setup). */
  async function createVault() {
    const result = await service.setup(PASSWORD);
    activeSession = null;
    return { dek: Uint8Array.from(result.session.key), recoveryKey: result.recoveryKey };
  }

  /** Bóveda de formato 1 (anterior): la clave derivada de la contraseña ES la clave de datos. */
  async function createLegacyV1Vault(): Promise<Uint8Array> {
    const salt = crypto.service.generateSalt();
    const key = await crypto.service.deriveKey(PASSWORD, salt, 310_000);
    stored = {
      salt,
      iterations: 310_000,
      verifier: await crypto.service.encrypt(key, VERIFIER_PLAINTEXT, AAD_VERIFIER),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      formatVersion: 1,
      wrappedDek: null,
      recoverySalt: null,
      recoveryWrappedDek: null,
    };
    return Uint8Array.from(key);
  }

  describe('status', () => {
    it('should report not initialized when there is no vault record', async () => {
      const status = await service.status();
      expect(status).toMatchObject({ initialized: false, recoveryAvailable: false });
      expect(status.pbkdf2Iterations).toBe(600_000);
    });

    it('should report recovery available for envelope vaults, with the stored iterations', async () => {
      await createVault();
      expect(await service.status()).toMatchObject({
        initialized: true,
        recoveryAvailable: true,
        pbkdf2Iterations: 600_000,
      });
    });

    it('should report recovery unavailable for a not-yet-upgraded (v1) vault', async () => {
      await createLegacyV1Vault();
      expect(await service.status()).toMatchObject({ initialized: true, recoveryAvailable: false });
    });
  });

  describe('setup', () => {
    it('should reject weak passwords before touching the vault', async () => {
      await expect(service.setup('corta')).rejects.toThrow(WeakMasterPasswordError);
      expect(vault.get).not.toHaveBeenCalled();
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should reject setup when the vault already exists', async () => {
      await createVault();
      vault.save.mockClear();
      await expect(service.setup(PASSWORD)).rejects.toThrow(VaultAlreadyInitializedError);
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should persist an envelope vault: wrapped DEK, wrapped recovery DEK and verifier', async () => {
      const { session, recoveryKey } = await service.setup(PASSWORD);

      expect(stored).toMatchObject({ formatVersion: 2, iterations: 600_000 });
      expect(stored!.wrappedDek).toBeInstanceOf(Uint8Array);
      expect(stored!.recoverySalt).toBeInstanceOf(Uint8Array);
      expect(stored!.recoveryWrappedDek).toBeInstanceOf(Uint8Array);
      expect(recoveryKey).toMatch(RECOVERY_FORMAT);

      // La sesión guarda la DEK, que cifra el verificador.
      await expect(
        crypto.service.decrypt(session.key, stored!.verifier, AAD_VERIFIER),
      ).resolves.toBe(VERIFIER_PLAINTEXT);
      expect(envs.create).toHaveBeenCalledWith('Local');
      expect(audit.record).toHaveBeenCalledWith('vault.setup', expect.any(String));
      expect(sessions.create).toHaveBeenCalledWith(session.key, 15);
    });

    it('should return a recovery key that really unwraps the stored DEK', async () => {
      const { session, recoveryKey } = await service.setup(PASSWORD);
      const raw = decodeRecoveryKey(recoveryKey)!;
      const kek = await crypto.service.deriveRecoveryKek(raw, stored!.recoverySalt!);
      const unwrapped = await crypto.service.unwrapKey(
        kek,
        stored!.recoveryWrappedDek!,
        AAD_DEK_RECOVERY,
      );
      expect(Buffer.from(unwrapped).equals(Buffer.from(session.key))).toBe(true);
    });

    it('should never persist the DEK, the KEKs or the recovery key in clear', async () => {
      const { session, recoveryKey } = await service.setup(PASSWORD);
      const persisted = JSON.stringify(
        Object.values(stored!).map((v) =>
          v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v,
        ),
      );
      expect(persisted).not.toContain(Buffer.from(session.key).toString('hex'));
      expect(persisted).not.toContain(recoveryKey);
    });

    it('should not create the default environment if one already exists', async () => {
      envs.list.mockResolvedValue([
        { id: 1, name: 'QA', createdAt: new Date(), updatedAt: new Date() },
      ]);
      await service.setup(PASSWORD);
      expect(envs.create).not.toHaveBeenCalled();
    });
  });

  describe('unlock', () => {
    it('should reject when the vault is not initialized', async () => {
      await expect(service.unlock(PASSWORD)).rejects.toThrow(VaultNotInitializedError);
    });

    it('should open an envelope vault with the right password and audit it', async () => {
      const { dek } = await createVault();
      const access = await service.unlock(PASSWORD);

      expect(Buffer.from(access.session.key).equals(Buffer.from(dek))).toBe(true);
      expect(access.recoveryKey).toBeUndefined();
      expect(audit.record).toHaveBeenCalledWith('vault.unlock', expect.any(String));
      expect(sessions.purgeExpired).toHaveBeenCalled();
    });

    it('should record a failed attempt and create no session on a wrong password', async () => {
      await createVault();
      sessions.create.mockClear();

      await expect(service.unlock('contraseña-equivocada')).rejects.toThrow(
        InvalidMasterPasswordError,
      );
      expect(audit.record).toHaveBeenCalledWith('vault.unlock_failed', expect.any(String));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('should reject a tampered wrapped DEK as a wrong password', async () => {
      await createVault();
      const tampered = new Uint8Array(stored!.wrappedDek!);
      tampered.set([(tampered.at(-1) ?? 0) ^ 1], tampered.length - 1);
      stored = { ...stored!, wrappedDek: tampered };

      await expect(service.unlock(PASSWORD)).rejects.toThrow(InvalidMasterPasswordError);
    });

    it('should reject a verifier whose plaintext does not match', async () => {
      const { dek } = await createVault();
      stored = {
        ...stored!,
        verifier: await crypto.service.encrypt(dek, 'otro-texto', AAD_VERIFIER),
      };
      await expect(service.unlock(PASSWORD)).rejects.toThrow(InvalidMasterPasswordError);
    });

    describe('upgrade of a v1 vault', () => {
      it('should keep the old key as the DEK, so existing secrets stay readable', async () => {
        const oldKey = await createLegacyV1Vault();
        const access = await service.unlock(PASSWORD);

        expect(Buffer.from(access.session.key).equals(Buffer.from(oldKey))).toBe(true);
        expect(access.recoveryKey).toMatch(RECOVERY_FORMAT);
        expect(stored).toMatchObject({ formatVersion: 2, createdAt: new Date('2024-01-01') });
        expect(audit.record).toHaveBeenCalledWith('vault.upgraded', expect.any(String));
      });

      it('should give the upgraded vault a working recovery key and password wrap', async () => {
        const oldKey = await createLegacyV1Vault();
        const first = await service.unlock(PASSWORD);

        const again = await service.unlock(PASSWORD);
        expect(again.recoveryKey).toBeUndefined(); // ya actualizada: no se vuelve a mostrar
        expect(Buffer.from(again.session.key).equals(Buffer.from(oldKey))).toBe(true);

        const recovered = await service.recover(first.recoveryKey!, NEW_PASSWORD);
        expect(Buffer.from(recovered.session.key).equals(Buffer.from(oldKey))).toBe(true);
      });

      it('should not upgrade or persist anything on a wrong password', async () => {
        await createLegacyV1Vault();
        await expect(service.unlock('contraseña-equivocada')).rejects.toThrow(
          InvalidMasterPasswordError,
        );
        expect(vault.save).not.toHaveBeenCalled();
        expect(stored!.formatVersion).toBe(1);
      });
    });
  });

  describe('lock', () => {
    it('should remove the session and audit when it existed', async () => {
      await createVault();
      const { session } = await service.unlock(PASSWORD);

      expect(await service.lock(session.sessionId)).toBe(true);
      expect(sessions.remove).toHaveBeenCalledWith(session.sessionId);
      expect(audit.record).toHaveBeenCalledWith('vault.lock', expect.any(String));
    });

    it('should be a no-op without a session', async () => {
      expect(await service.lock(undefined)).toBe(false);
      expect(sessions.remove).not.toHaveBeenCalled();
    });
  });

  describe('changeMasterPassword', () => {
    it('should throw VaultLockedError without an active session', async () => {
      await createVault();
      await expect(service.changeMasterPassword('s1', PASSWORD, NEW_PASSWORD)).rejects.toThrow(
        VaultLockedError,
      );
    });

    it('should verify the current password and save nothing when it is wrong', async () => {
      await createVault();
      const { session } = await service.unlock(PASSWORD);
      vault.save.mockClear();

      await expect(
        service.changeMasterPassword(session.sessionId, 'equivocada', NEW_PASSWORD),
      ).rejects.toThrow(InvalidMasterPasswordError);
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should reject weak new passwords', async () => {
      await createVault();
      const { session } = await service.unlock(PASSWORD);
      await expect(
        service.changeMasterPassword(session.sessionId, PASSWORD, 'corta'),
      ).rejects.toThrow(WeakMasterPasswordError);
    });

    it('should only re-wrap the DEK: the data key and the session key do not change', async () => {
      const { dek } = await createVault();
      const { session } = await service.unlock(PASSWORD);

      await service.changeMasterPassword(session.sessionId, PASSWORD, NEW_PASSWORD);

      // Sigue siendo la misma DEK → los secretos cifrados no se tocan.
      expect(Buffer.from(session.key).equals(Buffer.from(dek))).toBe(true);
      const reopened = await service.unlock(NEW_PASSWORD);
      expect(Buffer.from(reopened.session.key).equals(Buffer.from(dek))).toBe(true);
      expect(audit.record).toHaveBeenCalledWith('vault.password_changed', expect.any(String));
    });

    it('should make the old password stop working and keep the recovery key valid', async () => {
      const { recoveryKey } = await createVault();
      const { session } = await service.unlock(PASSWORD);
      await service.changeMasterPassword(session.sessionId, PASSWORD, NEW_PASSWORD);

      await expect(service.unlock(PASSWORD)).rejects.toThrow(InvalidMasterPasswordError);
      await expect(service.recover(recoveryKey, 'TerceraClaveSegura#3')).resolves.toBeDefined();
    });

    it('should use a fresh salt and preserve the original createdAt', async () => {
      await createVault();
      const before = stored!;
      const { session } = await service.unlock(PASSWORD);
      await service.changeMasterPassword(session.sessionId, PASSWORD, NEW_PASSWORD);

      expect(Buffer.from(stored!.salt).equals(Buffer.from(before.salt))).toBe(false);
      expect(stored!.createdAt).toEqual(before.createdAt);
    });
  });

  describe('recover', () => {
    it('should reject weak new passwords before checking the key', async () => {
      const { recoveryKey } = await createVault();
      vault.get.mockClear();
      await expect(service.recover(recoveryKey, 'corta')).rejects.toThrow(WeakMasterPasswordError);
      expect(vault.get).not.toHaveBeenCalled();
    });

    it('should reject when the vault is not initialized', async () => {
      await expect(service.recover('A'.repeat(52), NEW_PASSWORD)).rejects.toThrow(
        VaultNotInitializedError,
      );
    });

    it('should open the vault with the recovery key and set the new password', async () => {
      const { dek, recoveryKey } = await createVault();

      const access = await service.recover(recoveryKey, NEW_PASSWORD);

      expect(Buffer.from(access.session.key).equals(Buffer.from(dek))).toBe(true);
      expect(audit.record).toHaveBeenCalledWith('vault.recovered', expect.any(String));
      await expect(service.unlock(NEW_PASSWORD)).resolves.toBeDefined();
      await expect(service.unlock(PASSWORD)).rejects.toThrow(InvalidMasterPasswordError);
    });

    it('should accept the key typed in lowercase, with spaces or without hyphens', async () => {
      const { dek, recoveryKey } = await createVault();
      const messy = `  ${recoveryKey.toLowerCase().replaceAll('-', ' ')}  `;
      const access = await service.recover(messy, NEW_PASSWORD);
      expect(Buffer.from(access.session.key).equals(Buffer.from(dek))).toBe(true);
    });

    it('should REPLACE the recovery key: the used one stops working, the new one works', async () => {
      const { recoveryKey: oldKey } = await createVault();
      const { recoveryKey: newKey } = await service.recover(oldKey, NEW_PASSWORD);

      expect(newKey).toMatch(RECOVERY_FORMAT);
      expect(newKey).not.toBe(oldKey);
      await expect(service.recover(oldKey, 'CuartaClaveSegura#4')).rejects.toThrow(
        InvalidRecoveryKeyError,
      );
      await expect(service.recover(newKey, 'CuartaClaveSegura#4')).resolves.toBeDefined();
    });

    it('should reject a well-formed but wrong recovery key, audit it and save nothing', async () => {
      await createVault();
      vault.save.mockClear();
      const wrong = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX';
      await expect(service.recover(wrong, NEW_PASSWORD)).rejects.toThrow(InvalidRecoveryKeyError);
      expect(audit.record).toHaveBeenCalledWith('vault.recovery_failed', expect.any(String));
      expect(vault.save).not.toHaveBeenCalled();
      expect(sessions.create).toHaveBeenCalledTimes(1); // solo la de createVault
    });

    it('should reject malformed recovery keys', async () => {
      await createVault();
      for (const bad of ['', 'abc', 'ñ'.repeat(52), 'A'.repeat(51)]) {
        await expect(service.recover(bad, NEW_PASSWORD)).rejects.toThrow(InvalidRecoveryKeyError);
      }
    });

    it('should report recovery unavailable on a not-yet-upgraded vault', async () => {
      await createLegacyV1Vault();
      await expect(service.recover('A'.repeat(52), NEW_PASSWORD)).rejects.toThrow(
        RecoveryNotAvailableError,
      );
    });
  });

  describe('regenerateRecoveryKey', () => {
    it('should throw VaultLockedError without an active session', async () => {
      await createVault();
      await expect(service.regenerateRecoveryKey('s1', PASSWORD)).rejects.toThrow(VaultLockedError);
    });

    it('should require the current password', async () => {
      await createVault();
      const { session } = await service.unlock(PASSWORD);
      vault.save.mockClear();
      await expect(service.regenerateRecoveryKey(session.sessionId, 'equivocada')).rejects.toThrow(
        InvalidMasterPasswordError,
      );
      expect(vault.save).not.toHaveBeenCalled();
    });

    it('should issue a new key, invalidate the previous one and keep the DEK', async () => {
      const { dek, recoveryKey: oldKey } = await createVault();
      const { session } = await service.unlock(PASSWORD);

      const newKey = await service.regenerateRecoveryKey(session.sessionId, PASSWORD);

      expect(newKey).toMatch(RECOVERY_FORMAT);
      expect(newKey).not.toBe(oldKey);
      await expect(service.recover(oldKey, NEW_PASSWORD)).rejects.toThrow(InvalidRecoveryKeyError);
      const access = await service.recover(newKey, NEW_PASSWORD);
      expect(Buffer.from(access.session.key).equals(Buffer.from(dek))).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        'vault.recovery_key_regenerated',
        expect.any(String),
      );
    });
  });
});
