import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_SORT_ORDER, isSortOrder, oppositeOrder } from '@/lib/sort';
import type { SortOrder } from '@/lib/sort';

const STORAGE_KEY = 'sv-sort';

function readStoredOrder(): SortOrder {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSortOrder(stored) ? stored : DEFAULT_SORT_ORDER;
  } catch {
    return DEFAULT_SORT_ORDER;
  }
}

function storeOrder(order: SortOrder): void {
  try {
    localStorage.setItem(STORAGE_KEY, order);
  } catch {
    // Sin almacenamiento la preferencia solo dura la sesión.
  }
}

export const useSortStore = defineStore('sort', () => {
  const order = ref<SortOrder>(readStoredOrder());

  function toggle(): void {
    order.value = oppositeOrder(order.value);
    storeOrder(order.value);
  }

  return { order, toggle };
});
