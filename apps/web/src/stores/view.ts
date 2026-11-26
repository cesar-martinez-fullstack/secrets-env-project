import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_VIEW_MODE, isViewMode } from '@/lib/view-mode';
import type { ViewMode } from '@/lib/view-mode';

const STORAGE_KEY = 'sv-view';

function readStoredMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

function storeMode(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Sin almacenamiento la preferencia solo dura la sesión.
  }
}

export const useViewStore = defineStore('view', () => {
  const mode = ref<ViewMode>(readStoredMode());

  function set(next: ViewMode): void {
    mode.value = next;
    storeMode(next);
  }

  return { mode, set };
});
