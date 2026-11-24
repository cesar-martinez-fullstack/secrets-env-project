import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { pruneSelection, toggleAllIds, toggleId } from '@/lib/selection';

export const useSelectionStore = defineStore('selection', () => {
  const ids = ref<ReadonlySet<number>>(new Set());
  const count = computed(() => ids.value.size);

  return {
    ids,
    count,
    toggle: (id: number) => (ids.value = toggleId(ids.value, id)),
    toggleAll: (all: readonly number[]) => (ids.value = toggleAllIds(ids.value, all)),
    prune: (existing: readonly number[]) => (ids.value = pruneSelection(ids.value, existing)),
    clear: () => (ids.value = new Set()),
  };
});
