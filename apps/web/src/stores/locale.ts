import { defineStore } from 'pinia';
import { ref, watchEffect } from 'vue';
import { catalogs } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/catalogs';
import { createTranslator, pickLocale } from '@/i18n/translate';
import type { Locale, MessageParams } from '@/i18n/translate';

const translate = createTranslator(catalogs);

const STORAGE_KEY = 'sv-locale';

function readStoredLocale(): Locale {
  try {
    return pickLocale(localStorage.getItem(STORAGE_KEY), navigator.language);
  } catch {
    return pickLocale(null, navigator.language);
  }
}

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<Locale>(readStoredLocale());

  watchEffect(() => {
    document.documentElement.lang = locale.value;
  });

  function setLocale(next: Locale): void {
    locale.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sin almacenamiento disponible: el idioma vale solo para esta sesión.
    }
  }

  function t(key: MessageKey, params?: MessageParams): string {
    return translate(locale.value, key, params);
  }

  return { locale, setLocale, t };
});
