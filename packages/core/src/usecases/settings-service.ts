import { LOGO_MAX_BYTES, detectLogoType, validateAppearance } from '@secretvault/shared';
import type { Appearance } from '@secretvault/shared';
import type { AuditRepository, SettingsRepository } from '../ports/repositories';
import type { InstanceSettings } from '../domain/entities';
import { LogoInvalidError, ValidationFailedError } from '../domain/errors';

export interface SettingsServiceDeps {
  settings: SettingsRepository;
  audit: AuditRepository;
  now?: () => Date;
}

export class SettingsService {
  private readonly now: () => Date;

  constructor(private readonly deps: SettingsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get(): Promise<InstanceSettings> {
    return this.deps.settings.load();
  }

  async updateAppearance(appearance: Appearance): Promise<void> {
    const issues = validateAppearance(appearance);
    if (issues.length > 0) throw new ValidationFailedError(issues);

    const current = await this.deps.settings.load();
    await this.deps.settings.save({
      ...current,
      appearance: { ...appearance, appName: appearance.appName.trim() },
    });
    await this.deps.audit.record(
      'settings.appearance_changed',
      'Apariencia de la aplicación actualizada.',
    );
  }

  async setLogo(data: Uint8Array): Promise<void> {
    const mimeType = data.byteLength <= LOGO_MAX_BYTES ? detectLogoType(data) : null;
    if (mimeType === null) throw new LogoInvalidError();

    const current = await this.deps.settings.load();
    await this.deps.settings.save({ ...current, logo: { mimeType, data, updatedAt: this.now() } });
    await this.deps.audit.record('settings.logo_changed', 'Logo de la aplicación actualizado.');
  }

  async removeLogo(): Promise<void> {
    const current = await this.deps.settings.load();
    if (current.logo === null) return;

    await this.deps.settings.save({ ...current, logo: null });
    await this.deps.audit.record('settings.logo_removed', 'Logo de la aplicación eliminado.');
  }
}
