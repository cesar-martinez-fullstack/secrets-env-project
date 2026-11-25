/**
 * Casos de uso de secretos: CRUD, reveal (bajo demanda + auditado),
 * importación masiva (atómica) y exportación desencriptada por ambiente.
 *
 * Cifrado: cada blob lleva un AAD ligado a su fila (ambiente + nombre), así que
 * renombrar un secreto exige re-cifrarlo (ver `nextValue` / `nextNote`).
 */
import {
  MASKED_VALUE,
  MAX_BULK_SECRETS,
  MAX_IMPORT_ENTRIES,
  isValidImportEntry,
  parseEnvContent,
  validateSecretName,
  validateSecretNote,
  validateSecretValue,
} from '@secretvault/shared';
import type { ExportFormat, ImportEntry } from '@secretvault/shared';
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

const AUDIT_LISTED_NAMES = 10;

function assertImportSize(count: number): void {
  if (count <= MAX_IMPORT_ENTRIES) return;
  throw new ValidationFailedError([
    { field: 'entries', message: `Máximo ${MAX_IMPORT_ENTRIES} entradas por importación.` },
  ]);
}

function describeBulkDeletion(names: readonly string[]): string {
  const listed = names.slice(0, AUDIT_LISTED_NAMES).map((name) => `«${name}»`);
  const rest = names.length - listed.length;
  return `${names.length} secretos eliminados: ${listed.join(', ')}${rest > 0 ? ` y ${rest} más` : ''}.`;
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
      importedAt: secret.importedAt ?? null,
      position: secret.position,
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
      importedAt: patch.value === undefined ? undefined : null,
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

  /** Fija el orden manual de un ambiente: `ids` debe ser una permutación de sus secretos. */
  async reorder(environmentId: number, ids: readonly number[]): Promise<void> {
    if (!(await this.deps.environments.findById(environmentId))) {
      throw new EnvironmentNotFoundError(environmentId);
    }
    await this.deps.unitOfWork.run(async () => {
      const current = await this.deps.secrets.list({ environmentId });
      const known = new Set(current.map((secret) => secret.id));
      const isPermutation = ids.length === known.size && new Set(ids).size === ids.length;
      if (!isPermutation || !ids.every((id) => known.has(id))) {
        throw new ValidationFailedError([
          { field: 'ids', message: 'Debe incluir exactamente los secretos del ambiente.' },
        ]);
      }
      await this.deps.secrets.setPositions(environmentId, ids);
    });
  }

  /** Elimina varios secretos de forma atómica: si alguno no existe, no se borra ninguno. */
  async removeMany(ids: readonly number[]): Promise<number> {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || unique.length > MAX_BULK_SECRETS) {
      throw new ValidationFailedError([
        { field: 'ids', message: `Indica entre 1 y ${MAX_BULK_SECRETS} secretos.` },
      ]);
    }
    const names = await this.deps.unitOfWork.run(async () => {
      const removed: string[] = [];
      for (const id of unique) {
        const secret = await this.deps.secrets.findById(id);
        if (!secret) throw new SecretNotFoundError(id);
        await this.deps.secrets.delete(id);
        removed.push(secret.name);
      }
      return removed;
    });
    await this.deps.audit.record('secret.deleted', describeBulkDeletion(names));
    return names.length;
  }

  /** Importación masiva desde contenido .env. Atómica: o entra todo, o nada. */
  async import(
    key: Uint8Array,
    environmentId: number,
    content: string,
    overwrite: boolean,
  ): Promise<ImportResult> {
    const parsed = parseEnvContent(content);
    return this.importEntries(key, environmentId, {
      entries: parsed.entries.map(({ name, value }) => ({ name, value, note: null })),
      overwrite,
      invalidLines: parsed.invalidLines,
    });
  }

  /**
   * Importación de entradas ya estructuradas (.env, CSV o JSON). Atómica. Las inválidas se cuentan
   * en `invalidLines` y no se importan; las notas, si vienen, se cifran con su AAD.
   */
  async importEntries(
    key: Uint8Array,
    environmentId: number,
    batch: { entries: readonly ImportEntry[]; overwrite: boolean; invalidLines?: number },
  ): Promise<ImportResult> {
    const env = await this.deps.environments.findById(environmentId);
    if (!env) throw new EnvironmentNotFoundError(environmentId);
    assertImportSize(batch.entries.length);

    const valid = batch.entries.filter(isValidImportEntry);
    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      invalidLines: (batch.invalidLines ?? 0) + batch.entries.length - valid.length,
    };

    await this.deps.unitOfWork.run(async () => {
      for (const entry of valid) {
        await this.importEntry(key, environmentId, entry, batch.overwrite, result);
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
    const entries = await this.decryptEntries(key, records);

    await this.deps.audit.record(
      'secret.exported',
      `Exportación de ${entries.length} secreto(s) del ambiente «${env.name}» (formato ${format}).`,
    );
    return { entries, environmentName: env.name };
  }

  /** Exporta solo los secretos indicados; deben pertenecer a un mismo ambiente. */
  async exportSelected(
    key: Uint8Array,
    ids: readonly number[],
    format: ExportFormat,
  ): Promise<{ entries: ExportEntry[]; environmentName: string }> {
    const records = await this.loadByIds(ids);
    if (new Set(records.map((record) => record.environmentId)).size !== 1) {
      throw new ValidationFailedError([
        { field: 'ids', message: 'Los secretos deben ser de un mismo ambiente.' },
      ]);
    }
    const entries = await this.decryptEntries(key, records);
    const environmentName = records[0]!.environmentName;

    await this.deps.audit.record(
      'secret.exported',
      `Exportación de ${entries.length} secreto(s) seleccionados del ambiente «${environmentName}» (formato ${format}).`,
    );
    return { entries, environmentName: `${environmentName} (selección)` };
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async loadByIds(ids: readonly number[]): Promise<SecretWithMeta[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || unique.length > MAX_BULK_SECRETS) {
      throw new ValidationFailedError([
        { field: 'ids', message: `Indica entre 1 y ${MAX_BULK_SECRETS} secretos.` },
      ]);
    }
    const records: SecretWithMeta[] = [];
    for (const id of unique) {
      const record = await this.deps.secrets.findById(id);
      if (!record) throw new SecretNotFoundError(id);
      records.push(record);
    }
    return records;
  }

  private async decryptEntries(
    key: Uint8Array,
    records: readonly SecretRecord[],
  ): Promise<ExportEntry[]> {
    const entries: ExportEntry[] = [];
    for (const record of records) {
      const value = await this.decryptValue(key, record);
      const note = await this.decryptNote(key, record);
      entries.push({ name: record.name, value, note });
    }
    return entries;
  }

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
    entry: ImportEntry,
    overwrite: boolean,
    result: ImportResult,
  ): Promise<void> {
    const existing = await this.deps.secrets.findByName(environmentId, entry.name);
    if (existing && !overwrite) {
      result.skipped++;
      return;
    }
    // El AAD usa el nombre ALMACENADO (la búsqueda es case-insensitive).
    const name = existing?.name ?? entry.name;
    const { crypto } = this.deps;
    const valueEnc = await crypto.encrypt(key, entry.value, secretValueAad(environmentId, name));
    const noteEnc = entry.note
      ? await crypto.encrypt(key, entry.note, secretNoteAad(environmentId, name))
      : null;

    if (existing) {
      await this.deps.secrets.update(existing.id, noteEnc ? { valueEnc, noteEnc } : { valueEnc });
      result.updated++;
    } else {
      await this.deps.secrets.create({ environmentId, name, valueEnc, noteEnc });
      result.imported++;
    }
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
