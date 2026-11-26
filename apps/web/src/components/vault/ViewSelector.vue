<script setup lang="ts">
import { VIEW_MODES } from '@/lib/view-mode';
import type { ViewMode } from '@/lib/view-mode';
import type { MessageKey } from '@/i18n/catalogs';
import { useI18n } from '@/i18n/use-i18n';

defineProps<{ view: ViewMode }>();
const emit = defineEmits<{ change: [view: ViewMode] }>();

const { t } = useI18n();

const LABELS: Record<ViewMode, MessageKey> = {
  list: 'table.viewList',
  cards: 'table.viewCards',
  compact: 'table.viewCompact',
};
</script>

<template>
  <div role="group" :aria-label="t('table.viewLabel')" class="flex gap-0.5">
    <button
      v-for="option in VIEW_MODES"
      :key="option"
      type="button"
      class="rounded-lg px-2.5 py-1 font-medium transition-colors"
      :class="
        option === view
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
      "
      :aria-pressed="option === view"
      :data-testid="`view-${option}`"
      @click="emit('change', option)"
    >
      {{ t(LABELS[option]) }}
    </button>
  </div>
</template>
