import { validateProjectName } from '@secretvault/shared';
import type { AuditRepository, ProjectRepository } from '../ports/repositories';
import type { Project, ProjectWithCount } from '../domain/entities';
import {
  ProjectNameRequiredError,
  ProjectNameTakenError,
  ProjectNotEmptyError,
  ProjectNotFoundError,
} from '../domain/errors';

export interface ProjectServiceDeps {
  projects: ProjectRepository;
  audit: AuditRepository;
}

export class ProjectService {
  constructor(private readonly deps: ProjectServiceDeps) {}

  list(): Promise<ProjectWithCount[]> {
    return this.deps.projects.listWithCounts();
  }

  async create(name: string): Promise<Project> {
    const trimmed = this.validName(name);
    if (await this.deps.projects.findByName(trimmed)) throw new ProjectNameTakenError(trimmed);

    const created = await this.deps.projects.create(trimmed);
    await this.deps.audit.record('project.created', `Proyecto «${trimmed}» creado.`);
    return created;
  }

  async rename(id: number, name: string): Promise<Project> {
    const project = await this.requireProject(id);
    const trimmed = this.validName(name);
    const existing = await this.deps.projects.findByName(trimmed);
    if (existing && existing.id !== id) throw new ProjectNameTakenError(trimmed);

    await this.deps.projects.rename(id, trimmed);
    await this.deps.audit.record(
      'project.renamed',
      `Proyecto «${project.name}» renombrado a «${trimmed}».`,
    );
    return { ...project, name: trimmed, updatedAt: new Date() };
  }

  /** Solo se eliminan proyectos vacíos: nunca se borran ambientes ni secretos en cascada. */
  async remove(id: number): Promise<void> {
    const project = await this.requireProject(id);
    const environmentCount = await this.deps.projects.countEnvironments(id);
    if (environmentCount > 0) throw new ProjectNotEmptyError(project.name, environmentCount);

    await this.deps.projects.delete(id);
    await this.deps.audit.record('project.deleted', `Proyecto «${project.name}» eliminado.`);
  }

  private async requireProject(id: number): Promise<Project> {
    const project = await this.deps.projects.findById(id);
    if (!project) throw new ProjectNotFoundError(id);
    return project;
  }

  private validName(raw: string): string {
    const name = raw.trim();
    if (validateProjectName(name).length > 0) throw new ProjectNameRequiredError();
    return name;
  }
}
