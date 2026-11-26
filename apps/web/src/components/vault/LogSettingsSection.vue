<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LogLevel, LogLevelDto } from '@secretvault/shared';
import type { MessageKey } from '@/i18n/catalogs';
import { useI18n } from '@/i18n/use-i18n';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toast';

const { t, describeError } = useI18n();
const toast = useToastStore();

const saved = ref<LogLevelDto | null>(null);
const chosen = ref<LogLevel>('info');
const password = ref('');
const busy = ref(false);

const LABELS: Record<LogLevel, MessageKey> = {
  debug: 'logSettings.debug',
  info: 'logSettings.info',
  warn: 'logSettings.warn',
  error: 'logSettings.error',
};

function show(current: LogLevelDto): void {
  saved.value = current;
  chosen.value = current.level;
}

async function load(): Promise<void> {
  try {
    show(await api.getLogLevel());
  } catch (error) {
    toast.push('error', t('logSettings.failed'), describeError(error));
  }
}

async function save(): Promise<void> {
  if (password.value.length === 0 || busy.value) return;
  busy.value = true;
  try {
    show(await api.updateLogLevel({ currentPassword: password.value, level: chosen.value }));
    toast.push('success', t('logSettings.saved'));
  } catch (error) {
    toast.push('error', t('logSettings.failed'), describeError(error));
  } finally {
    password.value = '';
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <form v-if="saved" class="space-y-3" data-testid="settings-logs" @submit.prevent="save">
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      {{ t('logSettings.title') }}
    </h3>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('logSettings.body') }}</p>

    <div class="space-y-1">
      <label for="log-level" class="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {{ t('logSettings.level') }}
      </label>
      <select
        id="log-level"
        v-model="chosen"
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        data-testid="log-level"
      >
        <option v-for="option in saved.options" :key="option" :value="option">
          {{ t(LABELS[option]) }}
        </option>
      </select>
    </div>

    <div class="space-y-1">
      <label for="log-password" class="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {{ t('logSettings.password') }}
      </label>
      <input
        id="log-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        data-testid="log-password"
      />
    </div>

    <button
      type="submit"
      :disabled="busy || chosen === saved.level || password.length === 0"
      class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
      data-testid="log-save"
    >
      {{ t('logSettings.save') }}
    </button>
  </form>
</template>
