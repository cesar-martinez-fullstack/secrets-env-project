import { common as commonEs } from './es/common';
import { security as securityEs } from './es/security';
import { settings as settingsEs } from './es/settings';
import { shell as shellEs } from './es/shell';
import { io as ioEs } from './es/io';
import { secrets as secretsEs } from './es/secrets';
import { table as tableEs } from './es/table';
import { vault as vaultEs } from './es/vault';
import { common as commonEn } from './en/common';
import { security as securityEn } from './en/security';
import { settings as settingsEn } from './en/settings';
import { shell as shellEn } from './en/shell';
import { io as ioEn } from './en/io';
import { secrets as secretsEn } from './en/secrets';
import { table as tableEn } from './en/table';
import { vault as vaultEn } from './en/vault';
import type { Locale } from './translate';

export const es = {
  ...commonEs,
  ...shellEs,
  ...tableEs,
  ...secretsEs,
  ...vaultEs,
  ...securityEs,
  ...settingsEs,
  ...ioEs,
};
export type MessageKey = keyof typeof es;

export const en: Record<MessageKey, string> = {
  ...commonEn,
  ...shellEn,
  ...tableEn,
  ...secretsEn,
  ...vaultEn,
  ...securityEn,
  ...settingsEn,
  ...ioEn,
};

export const catalogs: Record<Locale, Record<string, string>> = { es, en };
