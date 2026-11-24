import { isNewerVersion, isOfficialReleaseUrl, normalizeVersion } from '@secretvault/shared';
import type { AuditRepository } from '../ports/repositories';
import type { ReleaseSource } from '../ports/release-source';
import { UpdateCheckFailedError } from '../domain/errors';
import type { UpdateCheck } from '../domain/entities';

export interface UpdateServiceDeps {
  source: ReleaseSource;
  audit: AuditRepository;
  currentVersion: string;
  now?: () => Date;
}

/** Comprueba, solo cuando se pide, si hay una versión estable más nueva. Nunca instala nada. */
export class UpdateService {
  constructor(private readonly deps: UpdateServiceDeps) {}

  async check(): Promise<UpdateCheck> {
    const { currentVersion, source, audit } = this.deps;
    const latest = await source.latestRelease();
    const latestVersion = latest ? normalizeVersion(latest.tag) : null;
    if (!latest || latestVersion === null || !isOfficialReleaseUrl(latest.url)) {
      throw new UpdateCheckFailedError();
    }

    await audit.record(
      'update.checked',
      `Comprobación de actualizaciones: última versión ${latestVersion}, instalada ${currentVersion}.`,
    );
    return {
      currentVersion,
      latestVersion,
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      releaseUrl: latest.url,
      checkedAt: (this.deps.now ?? (() => new Date()))(),
    };
  }
}
