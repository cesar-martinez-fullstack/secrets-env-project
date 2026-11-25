/**
 * Casos de uso de auditoría: consulta del historial local, retención configurable y vaciado.
 * Cambiar la retención o vaciar el historial destruye evidencia, así que piden la contraseña
 * maestra y dejan su propio evento.
 */
import { AUDIT_RETENTION_OPTIONS, isAuditRetention } from '@secretvault/shared';
import type { AuditRepository, SecuritySettingsRepository } from '../ports/repositories';
import type { PasswordConfirmer } from '../ports/password-confirmer';
import type { UnitOfWork } from '../ports/transaction';
import type { AuditEvent, AuditRetention } from '../domain/entities';
import { ValidationFailedError } from '../domain/errors';

export interface AuditServiceDeps {
  audit: AuditRepository;
  security: SecuritySettingsRepository;
  passwords: PasswordConfirmer;
  unitOfWork: UnitOfWork;
}

export class AuditService {
  constructor(private readonly deps: AuditServiceDeps) {}

  async list(limit: number, offset: number): Promise<{ events: AuditEvent[]; total: number }> {
    const events = await this.deps.audit.list(limit, offset);
    const total = await this.deps.audit.count();
    return { events, total };
  }

  async retention(): Promise<AuditRetention> {
    const { auditMaxEvents } = await this.deps.security.get();
    return { maxEvents: auditMaxEvents, options: AUDIT_RETENTION_OPTIONS };
  }

  /** Fija cuántos eventos se conservan y poda de inmediato los que sobren. */
  async setRetention(sessionId: string, password: string, maxEvents: number): Promise<void> {
    if (!isAuditRetention(maxEvents)) {
      throw new ValidationFailedError([
        { field: 'maxEvents', message: 'Elige una de las opciones disponibles.' },
      ]);
    }
    await this.deps.passwords.confirmPassword(sessionId, password);
    await this.deps.unitOfWork.run(async () => {
      const { auditMaxEvents: previous } = await this.deps.security.get();
      const before = await this.deps.audit.count();
      await this.deps.security.save({ auditMaxEvents: maxEvents });
      await this.deps.audit.prune(maxEvents);
      const removed = before - (await this.deps.audit.count());
      await this.deps.audit.record(
        'audit.retention_changed',
        `Retención del historial: de ${previous} a ${maxEvents} eventos (${removed} eliminados).`,
      );
    });
  }

  /** Borra todo el historial y deja constancia, como primer evento nuevo, de que se vació. */
  async clear(sessionId: string, password: string): Promise<number> {
    await this.deps.passwords.confirmPassword(sessionId, password);
    return this.deps.unitOfWork.run(async () => {
      const deleted = await this.deps.audit.clear();
      await this.deps.audit.record(
        'audit.cleared',
        `Historial de auditoría vaciado (${deleted} eventos eliminados).`,
      );
      return deleted;
    });
  }
}
