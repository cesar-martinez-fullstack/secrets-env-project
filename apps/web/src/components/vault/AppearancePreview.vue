<script setup lang="ts">
import { computed } from 'vue';
import type { Accent, ThemeMode } from '@secretvault/shared';
import { useI18n } from '@/i18n/use-i18n';
import { useSettingsStore } from '@/stores/settings';
import { useThemeStore } from '@/stores/theme';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ appName: string; accent: Accent; theme: ThemeMode }>();

const settings = useSettingsStore();
const themeStore = useThemeStore();
const { t } = useI18n();

const isDark = computed(() =>
  props.theme === 'system' ? themeStore.systemDark : props.theme === 'dark',
);
const rows = ['API_KEY', 'DATABASE_URL', 'STRIPE_TOKEN'] as const;
</script>

<template>
  <div
    :data-accent="accent"
    :class="{ dark: isDark }"
    class="select-none overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
    aria-hidden="true"
    data-testid="appearance-preview"
  >
    <div
      class="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <img
        v-if="settings.logoUrl"
        :src="settings.logoUrl"
        alt=""
        class="h-5 w-5 rounded-md object-contain"
      />
      <span
        v-else
        class="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-white"
      >
        <AppIcon name="lock" :size="11" />
      </span>
      <span class="truncate text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
        {{ appName }}
      </span>
      <span class="ml-auto h-1.5 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
    </div>

    <div class="grid grid-cols-[5.5rem_1fr] gap-3 p-3">
      <div class="space-y-1.5">
        <div
          class="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
        >
          {{ t('settings.preview.project') }}
        </div>
        <div class="h-4 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div class="h-4 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>

      <div class="space-y-2">
        <div
          v-for="row in rows"
          :key="row"
          class="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span class="font-mono text-[10px] text-zinc-700 dark:text-zinc-300">{{ row }}</span>
          <span class="text-[10px] text-indigo-600 dark:text-indigo-400">
            {{ t('settings.preview.reveal') }}
          </span>
        </div>
        <span
          class="inline-block rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-medium text-white"
        >
          {{ t('settings.preview.newSecret') }}
        </span>
      </div>
    </div>
  </div>
</template>
