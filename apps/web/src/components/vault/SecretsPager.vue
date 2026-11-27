<script setup lang="ts">
import { computed } from 'vue';
import { lastPage, pageRange } from '@/lib/pagination';
import { useI18n } from '@/i18n/use-i18n';

const props = defineProps<{ page: number; shown: number; total: number; busy: boolean }>();
const emit = defineEmits<{ go: [page: number] }>();

const { t } = useI18n();
const range = computed(() => pageRange(props.page, props.shown, props.total));

const button =
  'rounded-lg border border-zinc-200 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
</script>

<template>
  <nav
    class="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2 text-xs dark:border-zinc-800"
    :aria-label="t('table.pagesLabel')"
    data-testid="pager"
  >
    <span
      class="tabular-nums text-zinc-500 dark:text-zinc-400"
      aria-live="polite"
      data-testid="page-range"
    >
      {{ t('table.pageRange', { from: range.from, to: range.to, total }) }}
    </span>
    <div class="flex gap-2">
      <button
        type="button"
        :class="button"
        :disabled="busy || page === 0"
        data-testid="page-prev"
        @click="emit('go', page - 1)"
      >
        {{ t('table.prevPage') }}
      </button>
      <button
        type="button"
        :class="button"
        :disabled="busy || page >= lastPage(total)"
        data-testid="page-next"
        @click="emit('go', page + 1)"
      >
        {{ t('table.nextPage') }}
      </button>
    </div>
  </nav>
</template>
