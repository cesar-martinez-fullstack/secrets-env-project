<script setup lang="ts">
import { SORT_ORDERS } from '@/lib/sort';
import type { SortOrder } from '@/lib/sort';
import type { MessageKey } from '@/i18n/catalogs';
import { useI18n } from '@/i18n/use-i18n';

defineProps<{ order: SortOrder }>();
const emit = defineEmits<{ change: [order: SortOrder] }>();

const { t } = useI18n();

const LABELS: Record<SortOrder, MessageKey> = {
  asc: 'table.sortAsc',
  desc: 'table.sortDesc',
  manual: 'table.sortManual',
};
</script>

<template>
  <div role="group" :aria-label="t('table.sortLabel')" class="flex gap-0.5">
    <button
      v-for="option in SORT_ORDERS"
      :key="option"
      type="button"
      class="rounded-lg px-2.5 py-1 font-medium transition-colors"
      :class="
        option === order
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
      "
      :aria-pressed="option === order"
      :data-testid="`sort-${option}`"
      @click="emit('change', option)"
    >
      {{ t(LABELS[option]) }}
    </button>
  </div>
</template>
