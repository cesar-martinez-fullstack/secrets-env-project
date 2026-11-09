/**
 * Caso de uso de auditoría: consulta del historial local de eventos.
 */
import type { AuditRepository } from '../ports/repositories';
import type { AuditEvent } from '../domain/entities';

export interface AuditServiceDeps {
  audit: AuditRepository;
}

export class AuditService {
  constructor(private readonly deps: AuditServiceDeps) {}

  async list(limit: number, offset: number): Promise<{ events: AuditEvent[]; total: number }> {
    const events = await this.deps.audit.list(limit, offset);
    const total = await this.deps.audit.count();
    return { events, total };
  }
}
