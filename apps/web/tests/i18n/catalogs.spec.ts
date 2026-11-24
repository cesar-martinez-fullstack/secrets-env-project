import { describe, expect, it } from 'bun:test';
import { API_ERROR_CODES } from '@secretvault/shared';
import { catalogs, en, es } from '../../src/i18n/catalogs';
import { DEFAULT_LOCALE, LOCALES, createTranslator, pickLocale } from '../../src/i18n/translate';
import { absoluteTime, relativeTime } from '../../src/lib/time';

const placeholdersOf = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

describe('message catalogs', () => {
  it('should define every key of the base catalog in every locale', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(es).sort());
    }
  });

  it('should not leave empty messages', () => {
    for (const [key, text] of Object.entries(en)) {
      expect({ key, empty: text.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('should use the same placeholders in both languages', () => {
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect({ key, names: placeholdersOf(en[key]) }).toEqual({
        key,
        names: placeholdersOf(es[key]),
      });
    }
  });

  it('should have a translation for every API error code', () => {
    for (const code of API_ERROR_CODES) {
      expect({ code, translated: `error.${code}` in es }).toEqual({ code, translated: true });
    }
  });
});

describe('translate', () => {
  const translate = createTranslator(catalogs);

  it('should fill the placeholders', () => {
    expect(translate('en', 'projectForm.createdBody', { name: 'Shop' })).toBe(
      '«Shop» is ready to group environments.',
    );
  });

  it('should keep a placeholder with no value', () => {
    expect(translate('es', 'projectForm.createdBody')).toContain('{name}');
  });

  it('should fall back to the base language and then to the key', () => {
    const partial = createTranslator({ es: { 'a.b': 'base' }, en: {} });
    expect(partial('en', 'a.b')).toBe('base');
    expect(partial('en', 'missing.key')).toBe('missing.key');
  });
});

describe('pickLocale', () => {
  it('should prefer the stored language', () => {
    expect(pickLocale('en', 'es-ES')).toBe('en');
  });

  it('should follow the browser language when nothing is stored', () => {
    expect(pickLocale(null, 'en-US')).toBe('en');
    expect(pickLocale(null, 'es-MX')).toBe('es');
  });

  it('should use the default language for unsupported ones', () => {
    expect(pickLocale('fr', 'fr-FR')).toBe(DEFAULT_LOCALE);
  });
});

describe('localized time', () => {
  it('should format relative times in the chosen language', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinutesAgo, 'en')).toMatch(/minutes? ago/);
    expect(relativeTime(fiveMinutesAgo, 'es')).toMatch(/minutos/);
  });

  it('should format absolute times in the chosen language', () => {
    const iso = '2026-01-15T10:30:00.000Z';
    expect(absoluteTime(iso, 'en')).toMatch(/Jan/);
    expect(absoluteTime(iso, 'es')).toMatch(/ene/);
  });
});
