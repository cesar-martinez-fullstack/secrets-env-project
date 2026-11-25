<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { api } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { useI18n } from '@/i18n/use-i18n';
import { useToastStore } from '@/stores/toast';

const { t, describeError } = useI18n();
const toast = useToastStore();

const password = ref('');
const busy = ref(false);

async function download(): Promise<void> {
  if (password.value.length === 0 || busy.value) return;
  busy.value = true;
  try {
    const file = await api.downloadBackup(password.value);
    saveBlob(file.filename, file.blob);
    toast.push('success', t('backup.doneTitle'), t('backup.doneBody'));
  } catch (error) {
    toast.push('error', t('backup.failed'), describeError(error));
  } finally {
    password.value = '';
    busy.value = false;
  }
}
</script>

<template>
  <section class="space-y-2" data-testid="settings-backup">
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ t('backup.title') }}</h3>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('backup.body') }}</p>
    <p
      class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
    >
      {{ t('backup.warning') }}
    </p>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="download">
      <div class="min-w-0 flex-1 space-y-1">
        <label
          for="backup-password"
          class="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          {{ t('backup.password') }}
        </label>
        <input
          id="backup-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          data-testid="backup-password"
        />
      </div>
      <button
        type="submit"
        :disabled="busy || password.length === 0"
        class="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        data-testid="backup-download"
      >
        <AppIcon v-if="busy" name="loader" :size="14" class="animate-spin" />
        <AppIcon v-else name="download" :size="14" />
        {{ t('backup.download') }}
      </button>
    </form>
  </section>
</template>
