import type { AuditRepository } from '../ports/repositories';
import type { VaultBackup } from '../ports/backup';
import type { PasswordConfirmer } from '../ports/password-confirmer';
import type { BackupFile } from '../domain/entities';

export interface BackupServiceDeps {
  passwords: PasswordConfirmer;
  backup: VaultBackup;
  audit: AuditRepository;
  now?: () => Date;
}

/** Entrega una copia de la base solo a quien vuelve a demostrar la contraseña maestra. */
export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  async create(sessionId: string, currentPassword: string): Promise<BackupFile> {
    await this.deps.passwords.confirmPassword(sessionId, currentPassword);
    const bytes = await this.deps.backup.snapshot();
    await this.deps.audit.record(
      'vault.backup_created',
      `Copia de seguridad generada (${bytes.byteLength} bytes).`,
    );
    return { bytes, createdAt: (this.deps.now ?? (() => new Date()))() };
  }
}
