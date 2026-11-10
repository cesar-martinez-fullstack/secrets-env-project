import { ApiError } from '@/lib/api';
import { useLocaleStore } from '@/stores/locale';
import { catalogs } from './catalogs';
import type { MessageKey } from './catalogs';

export function useI18n() {
  const store = useLocaleStore();

  function describeError(error: unknown): string {
    if (!(error instanceof Error)) return store.t('common.unknownError');
    const key = `error.${error instanceof ApiError ? error.code : ''}`;
    const translatable = store.locale !== 'es' && key in catalogs.es;
    return translatable ? store.t(key as MessageKey) : error.message;
  }

  return { t: store.t, localeStore: store, describeError };
}
