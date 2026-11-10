import {
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
import type { ShareEnvironment, SharePayload } from '@secretvault/shared';
import type {
  AuditRepository,
  EnvironmentRepository,
  ProjectRepository,
  SecretRepository,
} from '../ports/repositories';
import { secretNoteAad, secretValueAad, shareAad } from '../ports/crypto';
import type { VaultCryptoService } from '../ports/crypto';
import type { UnitOfWork } from '../ports/transaction';
import type { ShareFile, ShareImportResult, SharePreview } from '../domain/entities';
import {
  EnvironmentNotFoundError,
  ProjectNotFoundError,
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

const countSecrets = (payload: SharePayload): number =>
  payload.environments.reduce((sum, env) => sum + env.secrets.length, 0);

export class ShareService {
  constructor(private readonly deps: ShareServiceDeps) {}

  async exportProject(key: Uint8Array, projectId: number, passphrase: string): Promise<ShareFile> {
    this.assertPassphrase(passphrase);
    const project = await this.deps.projects.findById(projectId);
    if (!project) throw new ProjectNotFoundError(projectId);

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
    const project = await this.deps.projects.findById(env.projectId);
    if (!project) throw new ProjectNotFoundError(env.projectId);

    const payload = { project: project.name, environments: [await this.collect(key, env)] };
    return this.seal(payload, passphrase, env.name);
  }

  async preview(content: string, passphrase: string): Promise<SharePreview> {
    const payload = this.validated(await this.open(content, passphrase));
    return {
      projectName: payload.project.trim(),
      environments: payload.environments.map((env) => ({
        name: env.name.trim(),
        secretCount: env.secrets.length,
      })),
      secretCount: countSecrets(payload),
    };
  }

  async importAsNewProject(
    key: Uint8Array,
    content: string,
    passphrase: string,
  ): Promise<ShareImportResult> {
    const payload = this.validated(await this.open(content, passphrase));

    return this.deps.unitOfWork.run(async () => {
      const name = await this.freeProjectName(payload.project.trim());
      const project = await this.deps.projects.create(name);
      for (const env of payload.environments) {
        await this.storeEnvironment(key, project.id, env);
      }
      const result = {
        projectId: project.id,
        projectName: name,
        environmentCount: payload.environments.length,
        secretCount: countSecrets(payload),
      };
      await this.deps.audit.record(
        'share.imported',
        `Archivo compartido importado como proyecto «${name}»: ${result.environmentCount} ambiente(s), ${result.secretCount} secreto(s).`,
      );
      return result;
    });
  }

  private assertPassphrase(passphrase: string): void {
    const issues = validateSharePassphrase(passphrase);
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }

  private async collect(key: Uint8Array, env: { id: number; name: string }) {
    const { crypto } = this.deps;
    const records = await this.deps.secrets.list({ environmentId: env.id });
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
    return { name: env.name, secrets };
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
    const environmentKey = env.name.trim().toLowerCase();
    if (validateEnvironmentName(env.name).length > 0 || seen.has(environmentKey)) return false;
    seen.add(environmentKey);

    const names = new Set<string>();
    return env.secrets.every((secret) => {
      const nameKey = secret.name.trim().toLowerCase();
      const valid =
        validateSecretName(secret.name).length === 0 &&
        validateSecretValue(secret.value).length === 0 &&
        validateSecretNote(secret.note ?? '').length === 0 &&
        !names.has(nameKey);
      names.add(nameKey);
      return valid;
    });
  }

  private async freeProjectName(base: string): Promise<string> {
    if (!(await this.deps.projects.findByName(base))) return base;
    for (let suffix = 2; ; suffix++) {
      const tail = ` (${suffix})`;
      const candidate = `${base.slice(0, MAX_PROJECT_NAME_LENGTH - tail.length)}${tail}`;
      if (!(await this.deps.projects.findByName(candidate))) return candidate;
    }
  }

  private async storeEnvironment(
    key: Uint8Array,
    projectId: number,
    env: ShareEnvironment,
  ): Promise<void> {
    const { crypto } = this.deps;
    const created = await this.deps.environments.create(projectId, env.name.trim());
    for (const secret of env.secrets) {
      const name = secret.name.trim();
      const note = secret.note?.trim() || null;
      await this.deps.secrets.create({
        environmentId: created.id,
        name,
        valueEnc: await crypto.encrypt(key, secret.value, secretValueAad(created.id, name)),
        noteEnc: note ? await crypto.encrypt(key, note, secretNoteAad(created.id, name)) : null,
      });
    }
  }
}
