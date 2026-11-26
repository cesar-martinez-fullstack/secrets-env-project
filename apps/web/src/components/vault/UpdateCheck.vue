<script setup lang="ts">
import { ref } from 'vue';
import type { UpdateCheckDto } from '@secretvault/shared';
import AppIcon from '@/components/AppIcon.vue';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { useSecurityStore } from '@/stores/security';
import { useI18n } from '@/i18n/use-i18n';
import { useToastStore } from '@/stores/toast';

const UPDATE_COMMAND = './scripts/update.sh';

const { t, describeError } = useI18n();
const toast = useToastStore();
const security = useSecurityStore();

const checking = ref(false);
const result = ref<UpdateCheckDto | null>(null);
const failure = ref<string | null>(null);

async function check(): Promise<void> {
  checking.value = true;
  failure.value = null;
  try {
    result.value = await api.checkForUpdate();
  } catch (error) {
    result.value = null;
    failure.value = describeError(error);
  } finally {
    checking.value = false;
  }
}

async function copyCommand(): Promise<void> {
  security.keepClipboard();
  if (await copyText(UPDATE_COMMAND)) toast.push('success', t('updates.copied'));
}
</script>

<template>
  <section class="space-y-2" data-testid="settings-updates">
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      {{ t('updates.title') }}
    </h3>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('updates.body') }}</p>
    <button
      type="button"
      :disabled="checking"
      class="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      data-testid="check-updates"
      @click="check"
    >
      <AppIcon v-if="checking" name="loader" :size="14" class="animate-spin" />
      {{ checking ? t('updates.checking') : t('updates.check') }}
    </button>

    <p
      v-if="failure"
      class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
      data-testid="update-error"
    >
      {{ failure }}
    </p>

    <p
      v-else-if="result && !result.updateAvailable"
      class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
      data-testid="update-current"
    >
      {{ t('updates.upToDate', { version: result.currentVersion }) }}
    </p>

    <div
      v-else-if="result"
      class="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
      data-testid="update-available"
    >
      <p class="font-medium">
        {{
          t('updates.available', { latest: result.latestVersion, current: result.currentVersion })
        }}
      </p>
      <a
        :href="result.releaseUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block font-medium underline"
        data-testid="update-notes"
      >
        {{ t('updates.notes') }}
      </a>
      <p>{{ t('updates.how') }}</p>
      <div class="flex items-center gap-2">
        <code
          class="flex-1 rounded-md bg-white px-2 py-1.5 font-mono text-[11px] dark:bg-zinc-900"
          data-testid="update-command"
          >{{ UPDATE_COMMAND }}</code
        >
        <button
          type="button"
          class="rounded-md border border-indigo-300 px-2 py-1.5 font-medium hover:bg-white dark:border-indigo-800 dark:hover:bg-zinc-900"
          @click="copyCommand"
        >
          {{ t('updates.copy') }}
        </button>
      </div>
    </div>
  </section>
</template>
