import {
  MAX_BULK_SECRETS,
  MAX_ENVIRONMENT_NAME_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  parseShareEnvelope,
  parseSharePayload,
  serializeShareEnvelope,
  validateEnvironmentName,
  validateProjectName,
  validateSecretName,
  validateSecretNote,
  validateSecretValue,
  validateSharePassphrase,
} from '@secretvault/shared';
import type { ShareEnvironment, ShareSecret, SharePayload } from '@secretvault/shared';
import type {
  AuditRepository,
  EnvironmentRepository,
  ProjectRepository,
  SecretRepository,
} from '../ports/repositories';
import { secretNoteAad, secretValueAad, shareAad } from '../ports/crypto';
import type { VaultCryptoService } from '../ports/crypto';
import type { UnitOfWork } from '../ports/transaction';
import type {
  Project,
  SecretWithMeta,
  ShareFile,
  ShareImportPlan,
  ShareImportResult,
  SharePreview,
  SharePreviewEnvironment,
} from '../domain/entities';
import {
  EnvironmentNotFoundError,
  ProjectNotFoundError,
  SecretNotFoundError,
  SharePackageInvalidError,
  ValidationFailedError,
} from '../domain/errors';

export interface ShareServiceDeps {
  projects: ProjectRepository;
  environments: EnvironmentRepository;
  secrets: SecretRepository;
  crypto: VaultCryptoService;
  audit: AuditRepository;
  unitOfWork: UnitOfWork;
}

interface Tally {
  environments: number;
  imported: number;
  updated: number;
  skipped: number;
}

interface ImportContext {
  key: Uint8Array;
  projectId: number;
  overwrite: boolean;
  importedAt: Date;
  tally: Tally;
}

const countSecrets = (payload: SharePayload): number =>
  payload.environments.reduce((sum, env) => sum + env.secrets.length, 0);

const normalized = (name: string): string => name.trim().toLowerCase();

export class ShareService {
  constructor(private readonly deps: ShareServiceDeps) {}

  async exportProject(key: Uint8Array, projectId: number, passphrase: string): Promise<ShareFile> {
    this.assertPassphrase(passphrase);
    const project = await this.requireProject(projectId);

    const environments = (await this.deps.environments.list()).filter(
      (env) => env.projectId === projectId,
    );
    const payload = {
      project: project.name,
      environments: await Promise.all(environments.map((env) => this.collect(key, env))),
    };
    return this.seal(payload, passphrase, null);
  }

  async exportEnvironment(
    key: Uint8Array,
    environmentId: number,
    passphrase: string,
  ): Promise<ShareFile> {
    this.assertPassphrase(passphrase);
    const env = await this.deps.environments.findById(environmentId);
    if (!env) throw new EnvironmentNotFoundError(environmentId);
    const project = await this.requireProject(env.projectId);

    const payload = { project: project.name, environments: [await this.collect(key, env)] };
    return this.seal(payload, passphrase, env.name);
  }

  /** Comparte solo los secretos indicados; deben pertenecer al mismo proyecto. */
  async exportSecrets(
    key: Uint8Array,
    secretIds: readonly number[],
    passphrase: string,
  ): Promise<ShareFile> {
    this.assertPassphrase(passphrase);
    const records = await this.loadSelection(secretIds);
    const byEnvironment = new Map<number, SecretWithMeta[]>();
    for (const record of records) {
      byEnvironment.set(record.environmentId, [
        ...(byEnvironment.get(record.environmentId) ?? []),
        record,
      ]);
    }
    const projectName = await this.singleProjectName([...byEnvironment.keys()]);

    const environments = [];
    for (const group of byEnvironment.values()) {
      environments.push(await this.collectRecords(key, group[0]!.environmentName, group));
    }
    const only = environments.length === 1 ? environments[0]!.name : null;
    return this.seal({ project: projectName, environments }, passphrase, only);
  }

  async preview(
    content: string,
    passphrase: string,
    projectId: number | null = null,
  ): Promise<SharePreview> {
    const payload = this.validated(await this.open(content, passphrase));
    const target = projectId === null ? null : await this.requireProject(projectId);
    const environments: SharePreviewEnvironment[] = [];
    for (const env of payload.environments) {
      environments.push(await this.describe(env, target));
    }
    return {
      projectName: payload.project.trim(),
      environments,
      secretCount: countSecrets(payload),
    };
  }

  async importPackage(
    key: Uint8Array,
    content: string,
    plan: ShareImportPlan,
  ): Promise<ShareImportResult> {
    const payload = this.validated(await this.open(content, plan.passphrase));
    return this.deps.unitOfWork.run(() => this.apply(key, payload, plan));
  }

  private async apply(
    key: Uint8Array,
    payload: SharePayload,
    plan: ShareImportPlan,
  ): Promise<ShareImportResult> {
    const separate = new Set(plan.separateEnvironments.map(normalized));
    const project = await this.resolveProject(payload.project.trim(), plan.projectId);
    const tally: Tally = { environments: 0, imported: 0, updated: 0, skipped: 0 };
    const context = {
      key,
      projectId: project.id,
      overwrite: plan.overwrite,
      importedAt: new Date(),
      tally,
    };
    for (const env of payload.environments) {
      await this.importEnvironment(context, env, separate.has(normalized(env.name)));
    }
    const result = this.resultOf(project, tally);
    await this.deps.audit.record(
      'share.imported',
      `Archivo compartido importado en el proyecto «${project.name}»: ${result.environmentCount} ambiente(s), ${result.importedCount} nuevo(s), ${result.updatedCount} actualizado(s), ${result.skippedCount} omitido(s).`,
    );
    return result;
  }

  private resultOf(project: Project, tally: Tally): ShareImportResult {
    return {
      projectId: project.id,
      projectName: project.name,
      environmentCount: tally.environments,
      importedCount: tally.imported,
      updatedCount: tally.updated,
      skippedCount: tally.skipped,
    };
  }

  private async requireProject(projectId: number): Promise<Project> {
    const project = await this.deps.projects.findById(projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    return project;
  }

  private assertPassphrase(passphrase: string): void {
    const issues = validateSharePassphrase(passphrase);
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }

  private async loadSelection(secretIds: readonly number[]): Promise<SecretWithMeta[]> {
    const ids = [...new Set(secretIds)];
    if (ids.length === 0 || ids.length > MAX_BULK_SECRETS) {
      throw new ValidationFailedError([
        { field: 'ids', message: `Indica entre 1 y ${MAX_BULK_SECRETS} secretos.` },
      ]);
    }
    const records: SecretWithMeta[] = [];
    for (const id of ids) {
      const record = await this.deps.secrets.findById(id);
      if (!record) throw new SecretNotFoundError(id);
      records.push(record);
    }
    return records;
  }

  private async singleProjectName(environmentIds: readonly number[]): Promise<string> {
    const projectIds = new Set<number>();
    for (const id of environmentIds) {
      const env = await this.deps.environments.findById(id);
      if (!env) throw new EnvironmentNotFoundError(id);
      projectIds.add(env.projectId);
    }
    if (projectIds.size !== 1) {
      throw new ValidationFailedError([
        { field: 'ids', message: 'Los secretos deben ser de un mismo proyecto.' },
      ]);
    }
    return (await this.requireProject([...projectIds][0]!)).name;
  }

  private async collect(key: Uint8Array, env: { id: number; name: string }) {
    const records = await this.deps.secrets.list({ environmentId: env.id });
    return this.collectRecords(key, env.name, records);
  }

  private async collectRecords(
    key: Uint8Array,
    environmentName: string,
    records: readonly SecretWithMeta[],
  ) {
    const { crypto } = this.deps;
    const secrets = [];
    for (const record of records) {
      const valueAad = secretValueAad(record.environmentId, record.name);
      const noteAad = secretNoteAad(record.environmentId, record.name);
      secrets.push({
        name: record.name,
        value: await crypto.decrypt(key, record.valueEnc, valueAad),
        note: record.noteEnc ? await crypto.decrypt(key, record.noteEnc, noteAad) : null,
      });
    }
    return { name: environmentName, secrets };
  }

  private async seal(
    payload: SharePayload,
    passphrase: string,
    environmentName: string | null,
  ): Promise<ShareFile> {
    const { crypto } = this.deps;
    const salt = crypto.generateSalt();
    const iterations = crypto.defaultIterations();
    const shareKey = await crypto.deriveKey(passphrase, salt, iterations);
    try {
      const data = await crypto.encrypt(shareKey, JSON.stringify(payload), shareAad(iterations));
      await this.deps.audit.record(
        'share.exported',
        `Paquete para compartir generado del proyecto «${payload.project}»: ${payload.environments.length} ambiente(s), ${countSecrets(payload)} secreto(s).`,
      );
      return {
        content: serializeShareEnvelope({ iterations, salt, data }),
        projectName: payload.project,
        environmentName,
      };
    } finally {
      shareKey.fill(0);
    }
  }

  private async open(content: string, passphrase: string): Promise<SharePayload> {
    const envelope = parseShareEnvelope(content);
    if (!envelope) throw new SharePackageInvalidError();
    const { crypto } = this.deps;
    const shareKey = await crypto.deriveKey(passphrase, envelope.salt, envelope.iterations);
    try {
      const plain = await crypto.decrypt(shareKey, envelope.data, shareAad(envelope.iterations));
      const payload = parseSharePayload(plain);
      if (!payload) throw new SharePackageInvalidError();
      return payload;
    } catch {
      throw new SharePackageInvalidError();
    } finally {
      shareKey.fill(0);
    }
  }

  private validated(payload: SharePayload): SharePayload {
    const environmentNames = new Set<string>();
    const valid =
      validateProjectName(payload.project).length === 0 &&
      payload.environments.every((env) => this.isValidEnvironment(env, environmentNames));
    if (!valid) throw new SharePackageInvalidError();
    return payload;
  }

  private isValidEnvironment(env: ShareEnvironment, seen: Set<string>): boolean {
    const environmentKey = normalized(env.name);
    if (validateEnvironmentName(env.name).length > 0 || seen.has(environmentKey)) return false;
    seen.add(environmentKey);

    const names = new Set<string>();
    return env.secrets.every((secret) => {
      const nameKey = normalized(secret.name);
      const valid =
        validateSecretName(secret.name).length === 0 &&
        validateSecretValue(secret.value).length === 0 &&
        validateSecretNote(secret.note ?? '').length === 0 &&
        !names.has(nameKey);
      names.add(nameKey);
      return valid;
    });
  }

  private async describe(
    env: ShareEnvironment,
    target: Project | null,
  ): Promise<SharePreviewEnvironment> {
    const name = env.name.trim();
    const existing = target ? await this.deps.environments.findByName(target.id, name) : null;
    const conflicts: string[] = [];
    if (existing) {
      for (const secret of env.secrets) {
        const secretName = secret.name.trim();
        if (await this.deps.secrets.findByName(existing.id, secretName)) {
          conflicts.push(secretName);
        }
      }
    }
    return { name, secretCount: env.secrets.length, exists: Boolean(existing), conflicts };
  }

  private async resolveProject(name: string, projectId: number | null): Promise<Project> {
    if (projectId !== null) return this.requireProject(projectId);
    const free = await this.freeName(name, MAX_PROJECT_NAME_LENGTH, async (candidate) =>
      Boolean(await this.deps.projects.findByName(candidate)),
    );
    return this.deps.projects.create(free);
  }

  private async freeName(
    base: string,
    maxLength: number,
    isTaken: (candidate: string) => Promise<boolean>,
  ): Promise<string> {
    if (!(await isTaken(base))) return base;
    for (let suffix = 2; ; suffix++) {
      const tail = ` (${suffix})`;
      const candidate = `${base.slice(0, maxLength - tail.length)}${tail}`;
      if (!(await isTaken(candidate))) return candidate;
    }
  }

  private async importEnvironment(
    context: ImportContext,
    env: ShareEnvironment,
    separate: boolean,
  ): Promise<void> {
    const { environments } = this.deps;
    const name = env.name.trim();
    const existing = await environments.findByName(context.projectId, name);
    const target =
      existing && !separate
        ? existing
        : await environments.create(
            context.projectId,
            await this.freeName(name, MAX_ENVIRONMENT_NAME_LENGTH, async (candidate) =>
              Boolean(await environments.findByName(context.projectId, candidate)),
            ),
          );
    context.tally.environments++;
    for (const secret of env.secrets) {
      await this.storeSecret(context, target.id, secret);
    }
  }

  private async storeSecret(
    context: ImportContext,
    environmentId: number,
    secret: ShareSecret,
  ): Promise<void> {
    const { secrets } = this.deps;
    const existing = await secrets.findByName(environmentId, secret.name.trim());
    if (existing && !context.overwrite) {
      context.tally.skipped++;
      return;
    }
    const name = existing?.name ?? secret.name.trim();
    const sealed = await this.sealSecret(context.key, environmentId, name, secret);
    const importedAt = context.importedAt;
    if (existing) {
      await secrets.update(existing.id, { ...sealed, importedAt });
      context.tally.updated++;
      return;
    }
    await secrets.create({ environmentId, name, ...sealed, importedAt });
    context.tally.imported++;
  }

  private async sealSecret(
    key: Uint8Array,
    environmentId: number,
    name: string,
    secret: ShareSecret,
  ): Promise<{ valueEnc: Uint8Array; noteEnc: Uint8Array | null }> {
    const { crypto } = this.deps;
    const note = secret.note?.trim() || null;
    return {
      valueEnc: await crypto.encrypt(key, secret.value, secretValueAad(environmentId, name)),
      noteEnc: note ? await crypto.encrypt(key, note, secretNoteAad(environmentId, name)) : null,
    };
  }
}
