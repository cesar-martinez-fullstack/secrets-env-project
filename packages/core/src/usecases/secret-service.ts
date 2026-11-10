/**
 * Casos de uso de secretos: CRUD, reveal (bajo demanda + auditado),
 * importación masiva (atómica) y exportación desencriptada por ambiente.
 *
 * Cifrado: cada blob lleva un AAD ligado a su fila (ambiente + nombre), así que
 * renombrar un secreto exige re-cifrarlo (ver `nextValue` / `nextNote`).
 */
import {
  MASKED_VALUE,
  parseEnvContent,
  validateSecretName,
  validateSecretNote,
  validateSecretValue,
} from '@secretvault/shared';
import type { ExportFormat } from '@secretvault/shared';
import type {
  AuditRepository,
  EnvironmentRepository,
  SecretRepository,
} from '../ports/repositories';
import { secretNoteAad, secretValueAad } from '../ports/crypto';
import type { VaultCryptoService } from '../ports/crypto';
import type { UnitOfWork } from '../ports/transaction';
import type {
  DecryptedSecret,
  ExportEntry,
  ImportResult,
  SecretRecord,
  SecretSummary,
  SecretWithMeta,
} from '../domain/entities';
import {
  EnvironmentNotFoundError,
  SecretNameInvalidError,
  SecretNameRequiredError,
  SecretNameTakenError,
  SecretNotFoundError,
  SecretValueRequiredError,
  ValidationFailedError,
} from '../domain/errors';

export interface SecretServiceDeps {
  secrets: SecretRepository;
  environments: EnvironmentRepository;
  crypto: VaultCryptoService;
  audit: AuditRepository;
  unitOfWork: UnitOfWork;
}

export class SecretService {
  constructor(private readonly deps: SecretServiceDeps) {}

  private toSummary(secret: SecretWithMeta): SecretSummary {
    return {
      id: secret.id,
      environmentId: secret.environmentId,
      environmentName: secret.environmentName,
      projectName: secret.projectName,
      name: secret.name,
      maskedValue: MASKED_VALUE,
      hasNote: secret.noteEnc !== null,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }

  /** Listado enmascarado. Opcionalmente filtrado por ambiente y búsqueda por nombre. */
  async list(filter: { environmentId?: number; query?: string } = {}): Promise<SecretSummary[]> {
    const query = filter.query?.trim();
    const records = await this.deps.secrets.list({
      environmentId: filter.environmentId,
      query: query && query.length > 0 ? query : undefined,
    });
    return records.map((r) => this.toSummary(r));
  }

  /** Revela un secreto: desencripta en RAM y registra el evento de auditoría. */
  async reveal(key: Uint8Array, id: number): Promise<DecryptedSecret> {
    const secret = await this.deps.secrets.findById(id);
    if (!secret) throw new SecretNotFoundError(id);

    const value = await this.decryptValue(key, secret);
    const note = await this.decryptNote(key, secret);

    await this.deps.audit.record(
      'secret.revealed',
      `Secreto «${secret.name}» revelado (ambiente: ${secret.environmentName}).`,
    );

    return {
      id: secret.id,
      environmentId: secret.environmentId,
      environmentName: secret.environmentName,
      name: secret.name,
      value,
      note,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }

  async create(
    key: Uint8Array,
    input: { environmentId: number; name: string; value: string; note?: string | null },
  ): Promise<SecretSummary> {
    const name = this.validName(input.name);
    this.assertValue(input.value);
    const note = this.validNote(input.note);

    const env = await this.deps.environments.findById(input.environmentId);
    if (!env) throw new EnvironmentNotFoundError(input.environmentId);
    if (await this.deps.secrets.findByName(env.id, name)) throw new SecretNameTakenError(name);

    const { crypto } = this.deps;
    const valueEnc = await crypto.encrypt(key, input.value, secretValueAad(env.id, name));
    const noteEnc = note ? await crypto.encrypt(key, note, secretNoteAad(env.id, name)) : null;

    const created = await this.deps.secrets.create({
      environmentId: env.id,
      name,
      valueEnc,
      noteEnc,
    });
    await this.deps.audit.record(
      'secret.created',
      `Secreto «${name}» creado en el ambiente «${env.name}».`,
    );

    const full = await this.deps.secrets.findById(created.id);
    if (!full) throw new SecretNotFoundError(created.id);
    return this.toSummary(full);
  }

  async update(
    key: Uint8Array,
    id: number,
    patch: { name?: string; value?: string; note?: string | null },
  ): Promise<SecretSummary> {
    const secret = await this.deps.secrets.findById(id);
    if (!secret) throw new SecretNotFoundError(id);

    const newName =
      patch.name === undefined ? secret.name : await this.validRename(secret, patch.name);
    const renamed = newName !== secret.name;

    // El AAD depende del nombre: renombrar obliga a re-cifrar lo que no se reemplaza.
    const valueEnc = await this.nextValue(key, secret, newName, renamed, patch.value);
    const noteEnc = await this.nextNote(key, secret, newName, renamed, patch.note);

    await this.deps.secrets.update(id, {
      name: renamed ? newName : undefined,
      valueEnc,
      noteEnc,
    });

    await this.deps.audit.record(
      'secret.updated',
      `Secreto «${secret.name}» actualizado (ambiente: ${secret.environmentName})${renamed ? ` → renombrado a «${newName}»` : ''}.`,
    );

    const updated = await this.deps.secrets.findById(id);
    if (!updated) throw new SecretNotFoundError(id);
    return this.toSummary(updated);
  }

  async remove(id: number): Promise<void> {
    const secret = await this.deps.secrets.findById(id);
    if (!secret) throw new SecretNotFoundError(id);
    await this.deps.secrets.delete(id);
    await this.deps.audit.record(
      'secret.deleted',
      `Secreto «${secret.name}» eliminado del ambiente «${secret.environmentName}».`,
    );
  }

  /** Importación masiva desde contenido .env. Atómica: o entra todo, o nada. */
  async import(
    key: Uint8Array,
    environmentId: number,
    content: string,
    overwrite: boolean,
  ): Promise<ImportResult> {
    const env = await this.deps.environments.findById(environmentId);
    if (!env) throw new EnvironmentNotFoundError(environmentId);

    const parsed = parseEnvContent(content);
    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      invalidLines: parsed.invalidLines,
    };

    await this.deps.unitOfWork.run(async () => {
      for (const entry of parsed.entries) {
        await this.importEntry(key, environmentId, entry, overwrite, result);
      }
      if (result.imported + result.updated > 0) {
        await this.deps.audit.record(
          'secret.imported',
          `Importación en «${env.name}»: ${result.imported} nuevo(s), ${result.updated} actualizado(s), ${result.skipped} omitido(s).`,
        );
      }
    });
    return result;
  }

  /** Exportación: desencripta todos los secretos de un ambiente y audita el evento. */
  async exportEntries(
    key: Uint8Array,
    environmentId: number,
    format: ExportFormat,
  ): Promise<{ entries: ExportEntry[]; environmentName: string }> {
    const env = await this.deps.environments.findById(environmentId);
    if (!env) throw new EnvironmentNotFoundError(environmentId);

    const records = await this.deps.secrets.list({ environmentId });
    const entries: ExportEntry[] = [];
    for (const record of records) {
      const value = await this.decryptValue(key, record);
      const note = await this.decryptNote(key, record);
      entries.push({ name: record.name, value, note });
    }

    await this.deps.audit.record(
      'secret.exported',
      `Exportación de ${entries.length} secreto(s) del ambiente «${env.name}» (formato ${format}).`,
    );
    return { entries, environmentName: env.name };
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private decryptValue(key: Uint8Array, s: SecretRecord): Promise<string> {
    return this.deps.crypto.decrypt(key, s.valueEnc, secretValueAad(s.environmentId, s.name));
  }

  private async decryptNote(key: Uint8Array, s: SecretRecord): Promise<string | null> {
    if (!s.noteEnc) return null;
    return this.deps.crypto.decrypt(key, s.noteEnc, secretNoteAad(s.environmentId, s.name));
  }

  private async importEntry(
    key: Uint8Array,
    environmentId: number,
    entry: { name: string; value: string },
    overwrite: boolean,
    result: ImportResult,
  ): Promise<void> {
    const existing = await this.deps.secrets.findByName(environmentId, entry.name);
    if (!existing) {
      const valueEnc = await this.deps.crypto.encrypt(
        key,
        entry.value,
        secretValueAad(environmentId, entry.name),
      );
      await this.deps.secrets.create({ environmentId, name: entry.name, valueEnc, noteEnc: null });
      result.imported++;
      return;
    }
    if (!overwrite) {
      result.skipped++;
      return;
    }
    // El AAD usa el nombre ALMACENADO (la búsqueda es case-insensitive).
    const valueEnc = await this.deps.crypto.encrypt(
      key,
      entry.value,
      secretValueAad(environmentId, existing.name),
    );
    await this.deps.secrets.update(existing.id, { valueEnc });
    result.updated++;
  }

  private validName(raw: string): string {
    const name = raw.trim();
    const issues = validateSecretName(name);
    if (issues.length === 0) return name;
    if (name.length === 0) throw new SecretNameRequiredError();
    throw new SecretNameInvalidError(issues);
  }

  private assertValue(value: string): void {
    if (validateSecretValue(value).length > 0) throw new SecretValueRequiredError();
  }

  /** Nota normalizada: `null` si queda vacía; lanza si excede el límite. */
  private validNote(raw: string | null | undefined): string | null {
    const note = raw?.trim() ?? '';
    if (note.length === 0) return null;
    const issues = validateSecretNote(note);
    if (issues.length > 0) throw new ValidationFailedError(issues);
    return note;
  }

  private async validRename(secret: SecretWithMeta, raw: string): Promise<string> {
    const newName = this.validName(raw);
    if (newName !== secret.name) {
      const dup = await this.deps.secrets.findByName(secret.environmentId, newName);
      if (dup && dup.id !== secret.id) throw new SecretNameTakenError(newName);
    }
    return newName;
  }

  private async nextValue(
    key: Uint8Array,
    secret: SecretWithMeta,
    newName: string,
    renamed: boolean,
    patchValue: string | undefined,
  ): Promise<Uint8Array | undefined> {
    if (patchValue === undefined && !renamed) return undefined;
    if (patchValue !== undefined) this.assertValue(patchValue);
    const plain = patchValue ?? (await this.decryptValue(key, secret));
    return this.deps.crypto.encrypt(key, plain, secretValueAad(secret.environmentId, newName));
  }

  private async nextNote(
    key: Uint8Array,
    secret: SecretWithMeta,
    newName: string,
    renamed: boolean,
    patchNote: string | null | undefined,
  ): Promise<Uint8Array | null | undefined> {
    const aad = secretNoteAad(secret.environmentId, newName);
    if (patchNote !== undefined) {
      const note = this.validNote(patchNote);
      return note ? this.deps.crypto.encrypt(key, note, aad) : null;
    }
    if (!renamed || !secret.noteEnc) return undefined;
    const plain = await this.decryptNote(key, secret);
    return this.deps.crypto.encrypt(key, plain ?? '', aad);
  }
}
