import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstanceSettings, SettingsRepository, StoredLogo } from '@secretvault/core';
import {
  DEFAULT_APPEARANCE,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  decodeBase64,
  detectLogoType,
  encodeBase64,
  isAccent,
  isThemeMode,
  isValidAppName,
} from '@secretvault/shared';
import type { Appearance, LogoMimeType } from '@secretvault/shared';

const SETTINGS_FILE = 'settings.json';
const FORMAT_VERSION = 1;

const DEFAULTS: InstanceSettings = { logo: null, appearance: DEFAULT_APPEARANCE };

interface StoredDocument {
  version: number;
  logo: { mimeType: string; data: string; updatedAt: string } | null;
  appearance?: Partial<Appearance>;
}

const isLogoMimeType = (value: unknown): value is LogoMimeType =>
  (LOGO_MIME_TYPES as readonly unknown[]).includes(value);

interface LogoFields {
  mimeType: LogoMimeType;
  data: string;
  updatedAt: string;
}

function logoFields(raw: unknown): LogoFields | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { mimeType, data, updatedAt } = raw as Record<string, unknown>;
  const valid =
    isLogoMimeType(mimeType) && typeof data === 'string' && typeof updatedAt === 'string';
  return valid ? { mimeType, data, updatedAt } : null;
}

const isSupportedImage = (bytes: Uint8Array | null, mimeType: LogoMimeType): bytes is Uint8Array =>
  bytes !== null && bytes.byteLength <= LOGO_MAX_BYTES && detectLogoType(bytes) === mimeType;

/**
 * El archivo es editable a mano, así que el logo se revalida al leerlo: si los bytes no
 * coinciden con el tipo declarado se descarta, y nunca se sirve algo que no sea una imagen.
 */
function parseLogo(raw: unknown): StoredLogo | null {
  const fields = logoFields(raw);
  if (!fields) return null;
  const bytes = decodeBase64(fields.data);
  const updatedAt = new Date(fields.updatedAt);
  if (!isSupportedImage(bytes, fields.mimeType) || Number.isNaN(updatedAt.getTime())) return null;
  return { mimeType: fields.mimeType, data: bytes, updatedAt };
}

/** Cada campo inválido o ausente vuelve a su valor por defecto: el archivo es editable a mano. */
function parseAppearance(raw: Partial<Appearance> | undefined): Appearance {
  const { appName, accent, defaultTheme } = raw ?? {};
  return {
    appName:
      typeof appName === 'string' && isValidAppName(appName)
        ? appName.trim()
        : DEFAULT_APPEARANCE.appName,
    accent: isAccent(accent) ? accent : DEFAULT_APPEARANCE.accent,
    defaultTheme: isThemeMode(defaultTheme) ? defaultTheme : DEFAULT_APPEARANCE.defaultTheme,
  };
}

export class FileSettingsRepository implements SettingsRepository {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, SETTINGS_FILE);
  }

  async load(): Promise<InstanceSettings> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch {
      return DEFAULTS;
    }
    try {
      const parsed = JSON.parse(text) as Partial<StoredDocument>;
      return { logo: parseLogo(parsed.logo), appearance: parseAppearance(parsed.appearance) };
    } catch {
      return DEFAULTS;
    }
  }

  async save(settings: InstanceSettings): Promise<void> {
    const document: StoredDocument = {
      version: FORMAT_VERSION,
      appearance: settings.appearance,
      logo: settings.logo && {
        mimeType: settings.logo.mimeType,
        data: encodeBase64(settings.logo.data),
        updatedAt: settings.logo.updatedAt.toISOString(),
      },
    };
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(document), { mode: 0o600 });
    await rename(temporary, this.path);
  }
}
