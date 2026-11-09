/**
 * Casos de uso de la bóveda: setup, unlock, lock, status, rotación de contraseña y
 * recuperación de acceso con la clave de recuperación.
 *
 * Cifrado de envoltura (envelope encryption):
 *
 *   contraseña ──PBKDF2──► KEK ──┐
 *                                ├─ envuelven ──► DEK (aleatoria) ──cifra──► secretos
 *   clave de recuperación ─HKDF─► KEK ┘
 *
 * La DEK nunca cambia al rotar la contraseña (solo se vuelve a envolver), y la clave de
 * recuperación permite abrir la bóveda sin la contraseña. Regla de oro: la DEK y las KEK
 * solo existen en RAM; en disco quedan únicamente sus versiones envueltas.
 */
import { decodeRecoveryKey, encodeRecoveryKey, validateMasterPassword } from '@secretvault/shared';
import type {
  AuditRepository,
  EnvironmentRepository,
  VaultRepository,
} from '../ports/repositories';
import type { VaultCryptoService } from '../ports/crypto';
import {
  AAD_DEK_MASTER,
  AAD_DEK_RECOVERY,
  AAD_VERIFIER,
  VERIFIER_PLAINTEXT,
} from '../ports/crypto';
import type { SessionStore } from '../ports/session';
import type { UnitOfWork } from '../ports/transaction';
import type { VaultInfo, VaultSession } from '../domain/entities';
import {
  InvalidMasterPasswordError,
  InvalidRecoveryKeyError,
  RecoveryNotAvailableError,
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
  crypto: VaultCryptoService;
  sessions: SessionStore;
  audit: AuditRepository;
  unitOfWork: UnitOfWork;
  config: VaultConfig;
}

export interface VaultStatus {
  initialized: boolean;
  /** `true` si la bóveda ya usa cifrado de envoltura y admite recuperación con clave. */
  recoveryAvailable: boolean;
  autoLockMinutes: number;
  pbkdf2Iterations: number;
}

/**
 * Resultado de abrir la bóveda. `recoveryKey` (texto para mostrar UNA sola vez) solo viene
 * cuando se generó una clave nueva: setup, recuperación o actualización de una bóveda anterior.
 */
export interface VaultAccess {
  session: VaultSession;
  recoveryKey?: string;
}

type MasterWrap = Pick<VaultInfo, 'salt' | 'iterations' | 'wrappedDek'>;
type RecoveryFields = Pick<VaultInfo, 'recoverySalt' | 'recoveryWrappedDek'>;
interface RecoveryWrap {
  /** Clave de recuperación en texto, para mostrarla una vez al usuario. */
  text: string;
  fields: RecoveryFields;
}

export class VaultService {
  constructor(private readonly deps: VaultServiceDeps) {}

  async status(): Promise<VaultStatus> {
    const vault = await this.deps.vaultRepo.get();
    return {
      initialized: vault !== null,
      recoveryAvailable: vault?.formatVersion === 2,
      autoLockMinutes: this.deps.config.autoLockMinutes,
      pbkdf2Iterations: vault?.iterations ?? this.deps.config.iterations,
    };
  }

  /** Primer arranque: crea la DEK, la envuelve (contraseña + recuperación) y el ambiente Local. */
  async setup(masterPassword: string): Promise<Required<VaultAccess>> {
    const issues = validateMasterPassword(masterPassword);
    if (issues.length > 0) throw new WeakMasterPasswordError(issues);
    if (await this.deps.vaultRepo.get()) throw new VaultAlreadyInitializedError();

    const { crypto, config } = this.deps;
    const dek = crypto.generateKey();
    const verifier = await crypto.encrypt(dek, VERIFIER_PLAINTEXT, AAD_VERIFIER);
    const master = await this.wrapForMaster(dek, masterPassword);
    const recovery = await this.wrapForRecovery(dek);

    const now = new Date();
    await this.deps.unitOfWork.run(async () => {
      await this.deps.vaultRepo.save({
        ...master,
        ...recovery.fields,
        verifier,
        formatVersion: 2,
        createdAt: now,
        updatedAt: now,
      });
      if ((await this.deps.environments.list()).length === 0) {
        await this.deps.environments.create('Local');
      }
      await this.deps.audit.record('vault.setup', 'Bóveda inicializada con contraseña maestra.');
    });

    const session = await this.deps.sessions.create(dek, config.autoLockMinutes);
    return { session, recoveryKey: recovery.text };
  }

  /**
   * Desbloqueo: obtiene la DEK con la contraseña y la valida contra el verificador cifrado.
   * Una bóveda de formato 1 se actualiza aquí mismo al formato 2 (genera su clave de recuperación).
   */
  async unlock(masterPassword: string): Promise<VaultAccess> {
    const info = await this.deps.vaultRepo.get();
    if (!info) throw new VaultNotInitializedError();

    await this.deps.sessions.purgeExpired(); // auto-lock por inactividad

    const dek = await this.openAuditingFailure(masterPassword, info);
    if (info.formatVersion === 1) return this.upgradeToEnvelope(info, dek, masterPassword);

    await this.deps.audit.record('vault.unlock', 'Bóveda desbloqueada.');
    const session = await this.deps.sessions.create(dek, this.deps.config.autoLockMinutes);
    return { session };
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
   * Cambio de contraseña maestra. La DEK no cambia: solo se vuelve a envolver con una KEK
   * nueva (nueva sal), así que no hace falta re-cifrar ningún secreto y la operación es
   * atómica por construcción (una sola fila + auditoría en la misma transacción).
   */
  async changeMasterPassword(
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const { session, info } = await this.requireSessionAndVault(sessionId);
    await this.assertCurrentPassword(currentPassword, info);

    const issues = validateMasterPassword(newPassword);
    if (issues.length > 0) throw new WeakMasterPasswordError(issues);
    if (info.formatVersion !== 2) throw new RecoveryNotAvailableError();

    const master = await this.wrapForMaster(session.key, newPassword);
    await this.deps.unitOfWork.run(async () => {
      await this.deps.vaultRepo.save({ ...info, ...master, updatedAt: new Date() });
      await this.deps.audit.record('vault.password_changed', 'Contraseña maestra cambiada.');
    });
  }

  /**
   * Recupera el acceso con la clave de recuperación y fija una contraseña nueva. La clave usada
   * se REEMPLAZA por otra nueva (se devuelve para mostrarla una vez): una clave escrita o
   * mostrada ya no debe seguir vigente.
   */
  async recover(recoveryKeyText: string, newPassword: string): Promise<Required<VaultAccess>> {
    const issues = validateMasterPassword(newPassword);
    if (issues.length > 0) throw new WeakMasterPasswordError(issues);

    const info = await this.deps.vaultRepo.get();
    if (!info) throw new VaultNotInitializedError();
    if (!this.hasRecovery(info)) throw new RecoveryNotAvailableError();

    const dek = await this.openWithRecoveryAuditingFailure(recoveryKeyText, info);
    const master = await this.wrapForMaster(dek, newPassword);
    const recovery = await this.wrapForRecovery(dek);

    await this.deps.unitOfWork.run(async () => {
      await this.deps.vaultRepo.save({
        ...info,
        ...master,
        ...recovery.fields,
        updatedAt: new Date(),
      });
      await this.deps.audit.record(
        'vault.recovered',
        'Acceso recuperado con la clave de recuperación; contraseña y clave de recuperación renovadas.',
      );
    });

    const session = await this.deps.sessions.create(dek, this.deps.config.autoLockMinutes);
    return { session, recoveryKey: recovery.text };
  }

  /** Genera una clave de recuperación nueva (invalida la anterior). Exige la contraseña actual. */
  async regenerateRecoveryKey(sessionId: string, currentPassword: string): Promise<string> {
    const { session, info } = await this.requireSessionAndVault(sessionId);
    await this.assertCurrentPassword(currentPassword, info);
    if (info.formatVersion !== 2) throw new RecoveryNotAvailableError();

    const recovery = await this.wrapForRecovery(session.key);
    await this.deps.unitOfWork.run(async () => {
      await this.deps.vaultRepo.save({ ...info, ...recovery.fields, updatedAt: new Date() });
      await this.deps.audit.record(
        'vault.recovery_key_regenerated',
        'Clave de recuperación regenerada; la anterior dejó de ser válida.',
      );
    });
    return recovery.text;
  }

  // ── Envoltura y apertura de la DEK ────────────────────────────────────────

  private async wrapForMaster(dek: Uint8Array, password: string): Promise<MasterWrap> {
    const { crypto, config } = this.deps;
    const salt = crypto.generateSalt();
    const kek = await crypto.deriveKey(password, salt, config.iterations);
    try {
      const wrappedDek = await crypto.wrapKey(kek, dek, AAD_DEK_MASTER);
      return { salt, iterations: config.iterations, wrappedDek };
    } finally {
      kek.fill(0);
    }
  }

  private async wrapForRecovery(dek: Uint8Array): Promise<RecoveryWrap> {
    const { crypto } = this.deps;
    const raw = crypto.generateKey();
    const recoverySalt = crypto.generateSalt();
    const kek = await crypto.deriveRecoveryKek(raw, recoverySalt);
    try {
      const recoveryWrappedDek = await crypto.wrapKey(kek, dek, AAD_DEK_RECOVERY);
      return { text: encodeRecoveryKey(raw), fields: { recoverySalt, recoveryWrappedDek } };
    } finally {
      kek.fill(0);
      raw.fill(0);
    }
  }

  /**
   * Obtiene la DEK a partir de la contraseña y la valida con el verificador (doble comprobación:
   * el tag GCM del desenvuelto y el texto conocido). ÚNICO punto de verificación de la contraseña.
   * En formato 1 la clave derivada ES la DEK.
   */
  private async openWithPassword(password: string, info: VaultInfo): Promise<Uint8Array> {
    const { crypto } = this.deps;
    const kek = await crypto.deriveKey(password, info.salt, info.iterations);
    let dek: Uint8Array = kek;
    try {
      if (info.formatVersion === 2 && info.wrappedDek) {
        dek = await crypto.unwrapKey(kek, info.wrappedDek, AAD_DEK_MASTER);
      }
      await this.assertVerifier(dek, info);
      if (dek !== kek) kek.fill(0);
      return dek;
    } catch {
      kek.fill(0);
      dek.fill(0);
      throw new InvalidMasterPasswordError();
    }
  }

  private async openWithRecovery(text: string, info: VaultInfo): Promise<Uint8Array> {
    const { crypto } = this.deps;
    const raw = decodeRecoveryKey(text);
    if (!raw || !info.recoverySalt || !info.recoveryWrappedDek) throw new InvalidRecoveryKeyError();

    const kek = await crypto.deriveRecoveryKek(raw, info.recoverySalt);
    raw.fill(0);
    let dek: Uint8Array | null = null;
    try {
      dek = await crypto.unwrapKey(kek, info.recoveryWrappedDek, AAD_DEK_RECOVERY);
      await this.assertVerifier(dek, info);
      return dek;
    } catch {
      dek?.fill(0);
      throw new InvalidRecoveryKeyError();
    } finally {
      kek.fill(0);
    }
  }

  private async assertVerifier(dek: Uint8Array, info: VaultInfo): Promise<void> {
    const decrypted = await this.deps.crypto.decrypt(dek, info.verifier, AAD_VERIFIER);
    if (decrypted !== VERIFIER_PLAINTEXT) throw new Error('verifier mismatch');
  }

  private async openAuditingFailure(password: string, info: VaultInfo): Promise<Uint8Array> {
    try {
      return await this.openWithPassword(password, info);
    } catch (error) {
      if (error instanceof InvalidMasterPasswordError) {
        await this.deps.audit.record('vault.unlock_failed', 'Intento de desbloqueo fallido.');
      }
      throw error;
    }
  }

  private async openWithRecoveryAuditingFailure(
    text: string,
    info: VaultInfo,
  ): Promise<Uint8Array> {
    try {
      return await this.openWithRecovery(text, info);
    } catch (error) {
      if (error instanceof InvalidRecoveryKeyError) {
        await this.deps.audit.record('vault.recovery_failed', 'Intento de recuperación fallido.');
      }
      throw error;
    }
  }

  /** Migra una bóveda de formato 1: la clave derivada pasa a ser la DEK y se crea la recuperación. */
  private async upgradeToEnvelope(
    info: VaultInfo,
    dek: Uint8Array,
    password: string,
  ): Promise<Required<VaultAccess>> {
    const master = await this.wrapForMaster(dek, password);
    const recovery = await this.wrapForRecovery(dek);
    await this.deps.unitOfWork.run(async () => {
      await this.deps.vaultRepo.save({
        ...info,
        ...master,
        ...recovery.fields,
        formatVersion: 2,
        updatedAt: new Date(),
      });
      await this.deps.audit.record(
        'vault.upgraded',
        'Bóveda actualizada al cifrado de envoltura con clave de recuperación.',
      );
      await this.deps.audit.record('vault.unlock', 'Bóveda desbloqueada.');
    });
    const session = await this.deps.sessions.create(dek, this.deps.config.autoLockMinutes);
    return { session, recoveryKey: recovery.text };
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  private hasRecovery(info: VaultInfo): boolean {
    return info.formatVersion === 2 && !!info.recoverySalt && !!info.recoveryWrappedDek;
  }

  private async assertCurrentPassword(password: string, info: VaultInfo): Promise<void> {
    const check = await this.openWithPassword(password, info);
    check.fill(0); // solo servía para verificar; la sesión conserva su propia copia de la DEK
  }

  private async requireSessionAndVault(
    sessionId: string,
  ): Promise<{ session: VaultSession; info: VaultInfo }> {
    const session = await this.deps.sessions.get(sessionId);
    if (!session) throw new VaultLockedError();
    const info = await this.deps.vaultRepo.get();
    if (!info) throw new VaultNotInitializedError();
    return { session, info };
  }
}
