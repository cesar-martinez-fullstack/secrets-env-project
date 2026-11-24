export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export type MessageParams = Readonly<Record<string, string | number>>;

export type Catalog = Readonly<Record<string, string>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function pickLocale(stored: string | null, browserLanguage: string): Locale {
  if (isLocale(stored)) return stored;
  const base = browserLanguage.toLowerCase().split('-')[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export type Translator = (locale: Locale, key: string, params?: MessageParams) => string;

export function createTranslator(catalogs: Readonly<Record<Locale, Catalog>>): Translator {
  return (locale, key, params = {}) => {
    const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      String(params[name] ?? placeholder),
    );
  };
}
