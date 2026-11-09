/**
 * Casos de uso de la bóveda: setup, unlock, lock, status y rotación de contraseña.
 * Regla de oro: la clave AES derivada SOLO existe en RAM (SessionStore).
 */
import { validateMasterPassword } from '@secretvault/shared';
import type {
  EnvironmentRepository,
  SecretRepository,
  VaultRepository,
} from '../ports/repositories';
import type { VaultCryptoService } from '../ports/crypto';
import { AAD_VERIFIER, VERIFIER_PLAINTEXT, secretNoteAad, secretValueAad } from '../ports/crypto';
import type { SessionStore } from '../ports/session';
import type { UnitOfWork } from '../ports/transaction';
import type { AuditRepository } from '../ports/repositories';
import type { SecretRecord, VaultInfo, VaultSession } from '../domain/entities';
import {
  InvalidMasterPasswordError,
  VaultAlreadyInitializedError,
  VaultLockedError,
  VaultNotInitializedError,
  WeakMasterPasswordError,
} from '../domain/errors';

export interface VaultConfig {
  iterations: number;
  autoLockMinutes: number;
}

export interface VaultServiceDeps {
  vaultRepo: VaultRepository;
  environments: EnvironmentRepository;
  secrets: SecretRepository;
  crypto: VaultCryptoService;
  sessions: SessionStore;
  audit: AuditRepository;
  unitOfWork: UnitOfWork;
  config: VaultConfig;
}

export interface VaultStatus {
  initialized: boolean;
  autoLockMinutes: number;
  pbkdf2Iterations: number;
}

export class VaultService {
  constructor(private readonly deps: VaultServiceDeps) {}

  async status(): Promise<VaultStatus> {
    const vault = await this.deps.vaultRepo.get();
    return {
      initialized: vault !== null,
      autoLockMinutes: this.deps.config.autoLockMinutes,
      pbkdf2Iterations: vault?.iterations ?? this.deps.config.iterations,
    };
  }

  /** Primer arranque: fija la contraseña maestra, crea el verificador y el ambiente Local. */
  async setup(masterPassword: string): Promise<VaultSession> {
    const issues = validateMasterPassword(masterPassword);
    if (issues.length > 0) throw new WeakMasterPasswordError(issues);

    const existing = await this.deps.vaultRepo.get();
    if (existing) throw new VaultAlreadyInitializedError();

    const salt = this.deps.crypto.generateSalt();
    const key = await this.deps.crypto.deriveKey(masterPassword, salt, this.deps.config.iterations);
    const verifier = await this.deps.crypto.encrypt(key, VERIFIER_PLAINTEXT, AAD_VERIFIER);

    const now = new Date();
    const info: VaultInfo = {
      salt,
      iterations: this.deps.config.iterations,
      verifier,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.vaultRepo.save(info);

    // Ambiente por defecto
    if ((await this.deps.environments.list()).length === 0) {
      await this.deps.environments.create('Local');
    }

    await this.deps.audit.record('vault.setup', 'Bóveda inicializada con contraseña maestra.');

    const session = await this.deps.sessions.create(key, this.deps.config.autoLockMinutes);
    return session;
  }

  /** Desbloqueo: deriva la clave en RAM y valida contra el verificador cifrado. */
  async unlock(masterPassword: string): Promise<VaultSession> {
    const info = await this.deps.vaultRepo.get();
    if (!info) throw new VaultNotInitializedError();

    // Purga previa de sesiones vencidas (auto-lock por inactividad).
    await this.deps.sessions.purgeExpired();

    let key: Uint8Array;
    try {
      key = await this.verifyPassword(masterPassword, info);
    } catch (error) {
      if (error instanceof InvalidMasterPasswordError) {
        await this.deps.audit.record('vault.unlock_failed', 'Intento de desbloqueo fallido.');
      }
      throw error;
    }

    await this.deps.audit.record('vault.unlock', 'Bóveda desbloqueada.');
    return this.deps.sessions.create(key, this.deps.config.autoLockMinutes);
  }

  /** Bloqueo manual o por inactividad: destruye la clave en RAM. */
  async lock(sessionId: string | undefined): Promise<boolean> {
    if (!sessionId) return false;
    const existed = await this.deps.sessions.get(sessionId);
    await this.deps.sessions.remove(sessionId);
    if (existed) {
      await this.deps.audit.record('vault.lock', 'Bóveda bloqueada (cierre de sesión).');
      return true;
    }
    return false;
  }

  /**
   * Rotación de contraseña maestra: re-encripta TODOS los secretos con una clave nueva.
   * La sesión activa mantiene su vida útil pero con la clave nueva.
   */
  async changeMasterPassword(
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const session = await this.deps.sessions.get(sessionId);
    if (!session) throw new VaultLockedError();

    const info = await this.deps.vaultRepo.get();
    if (!info) throw new VaultNotInitializedError();

    const currentKey = await this.verifyPassword(currentPassword, info);
    currentKey.fill(0); // solo servía para verificar; la sesión ya tiene su propia clave

    const issues = validateMasterPassword(newPassword);
    if (issues.length > 0) throw new WeakMasterPasswordError(issues);

    const newSalt = this.deps.crypto.generateSalt();
    const newKey = await this.deps.crypto.deriveKey(
      newPassword,
      newSalt,
      this.deps.config.iterations,
    );
    const newVerifier = await this.deps.crypto.encrypt(newKey, VERIFIER_PLAINTEXT, AAD_VERIFIER);

    // ATOMICIDAD: re-cifrado de todos los secretos + nuevo verificador + auditoría
    // van en una sola transacción. Un fallo a medias no puede dejar la bóveda
    // con secretos bajo la clave nueva y el verificador bajo la vieja.
    await this.deps.unitOfWork.run(async () => {
      const all = await this.deps.secrets.list();
      for (const secret of all) {
        await this.reencrypt(secret, session.key, newKey);
      }
      await this.deps.vaultRepo.save({
        salt: newSalt,
        iterations: this.deps.config.iterations,
        verifier: newVerifier,
        createdAt: info.createdAt,
        updatedAt: new Date(),
      });
      await this.deps.audit.record(
        'vault.password_changed',
        `Contraseña maestra rotada: ${all.length} secreto(s) re-encriptado(s).`,
      );
    });

    await this.deps.sessions.rotateKey(sessionId, newKey);
  }

  /**
   * Deriva la clave y la valida descifrando el verificador y comparando el texto
   * conocido (doble comprobación: tag GCM + contenido). ÚNICO punto de verificación
   * de la contraseña maestra: unlock y rotación comparten esta lógica.
   */
  private async verifyPassword(password: string, info: VaultInfo): Promise<Uint8Array> {
    const key = await this.deps.crypto.deriveKey(password, info.salt, info.iterations);
    try {
      const decrypted = await this.deps.crypto.decrypt(key, info.verifier, AAD_VERIFIER);
      if (decrypted !== VERIFIER_PLAINTEXT) throw new Error('verifier mismatch');
      return key;
    } catch {
      key.fill(0);
      throw new InvalidMasterPasswordError();
    }
  }

  private async reencrypt(
    secret: SecretRecord,
    oldKey: Uint8Array,
    newKey: Uint8Array,
  ): Promise<void> {
    const { crypto } = this.deps;
    const valueAad = secretValueAad(secret.environmentId, secret.name);
    const value = await crypto.decrypt(oldKey, secret.valueEnc, valueAad);
    const valueEnc = await crypto.encrypt(newKey, value, valueAad);
    let noteEnc: Uint8Array | null = null;
    if (secret.noteEnc) {
      const noteAad = secretNoteAad(secret.environmentId, secret.name);
      const note = await crypto.decrypt(oldKey, secret.noteEnc, noteAad);
      noteEnc = await crypto.encrypt(newKey, note, noteAad);
    }
    await this.deps.secrets.update(secret.id, { valueEnc, noteEnc });
  }
}
