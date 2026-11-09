/**
 * Casos de uso de ambientes: crear, renombrar, eliminar (con cascada de secretos).
 */
import { validateEnvironmentName } from '@secretvault/shared';
import type {
  AuditRepository,
  EnvironmentRepository,
  SecretRepository,
} from '../ports/repositories';
import type { Environment, EnvironmentWithCount } from '../domain/entities';
import {
  EnvironmentNameRequiredError,
  EnvironmentNameTakenError,
  EnvironmentNotFoundError,
} from '../domain/errors';

export interface EnvironmentServiceDeps {
  environments: EnvironmentRepository;
  secrets: SecretRepository;
  audit: AuditRepository;
}

export class EnvironmentService {
  constructor(private readonly deps: EnvironmentServiceDeps) {}

  async list(): Promise<EnvironmentWithCount[]> {
    return this.deps.environments.listWithCounts();
  }

  async create(name: string): Promise<Environment> {
    const trimmed = name.trim();
    const issues = validateEnvironmentName(trimmed);
    if (issues.length > 0) throw new EnvironmentNameRequiredError();

    const existing = await this.deps.environments.findByName(trimmed);
    if (existing) throw new EnvironmentNameTakenError(trimmed);

    const created = await this.deps.environments.create(trimmed);
    await this.deps.audit.record('env.created', `Ambiente «${trimmed}» creado.`);
    return created;
  }

  async rename(id: number, name: string): Promise<Environment> {
    const env = await this.deps.environments.findById(id);
    if (!env) throw new EnvironmentNotFoundError(id);

    const trimmed = name.trim();
    const issues = validateEnvironmentName(trimmed);
    if (issues.length > 0) throw new EnvironmentNameRequiredError();

    const existing = await this.deps.environments.findByName(trimmed);
    if (existing && existing.id !== id) throw new EnvironmentNameTakenError(trimmed);

    await this.deps.environments.rename(id, trimmed);
    await this.deps.audit.record(
      'env.renamed',
      `Ambiente «${env.name}» renombrado a «${trimmed}».`,
    );
    return { ...env, name: trimmed, updatedAt: new Date() };
  }

  async delete(id: number): Promise<{ deletedSecrets: number }> {
    const env = await this.deps.environments.findById(id);
    if (!env) throw new EnvironmentNotFoundError(id);

    const secrets = await this.deps.secrets.list({ environmentId: id });
    await this.deps.environments.delete(id); // ON DELETE CASCADE elimina los secretos
    await this.deps.audit.record(
      'env.deleted',
      `Ambiente «${env.name}» eliminado junto con ${secrets.length} secreto(s).`,
    );
    return { deletedSecrets: secrets.length };
  }
}
