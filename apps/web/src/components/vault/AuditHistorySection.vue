<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AuditRetentionDto } from '@secretvault/shared';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/use-i18n';
import { useToastStore } from '@/stores/toast';

const { t, describeError } = useI18n();
const toast = useToastStore();

const retention = ref<AuditRetentionDto | null>(null);
const chosen = ref(0);
const password = ref('');
const busy = ref(false);
const confirmingClear = ref(false);

async function load(): Promise<void> {
  try {
    retention.value = await api.getAuditRetention();
    chosen.value = retention.value.maxEvents;
  } catch (error) {
    toast.push('error', t('auditSettings.failed'), describeError(error));
  }
}

async function run(work: () => Promise<void>): Promise<void> {
  if (password.value.length === 0 || busy.value) return;
  busy.value = true;
  try {
    await work();
  } catch (error) {
    toast.push('error', t('auditSettings.failed'), describeError(error));
  } finally {
    password.value = '';
    confirmingClear.value = false;
    busy.value = false;
  }
}

function cancelClear(): void {
  confirmingClear.value = false;
  password.value = '';
}

const saveRetention = () =>
  run(async () => {
    retention.value = await api.updateAuditRetention(chosen.value, password.value);
    toast.push('success', t('auditSettings.saved'));
  });

const clearHistory = () =>
  run(async () => {
    const { deleted } = await api.clearAudit(password.value);
    toast.push('success', t('auditSettings.cleared', { count: deleted }));
  });

onMounted(load);

const secondaryButton =
  'rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
</script>

<template>
  <section v-if="retention" class="space-y-3" data-testid="settings-audit">
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      {{ t('auditSettings.title') }}
    </h3>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('auditSettings.body') }}</p>

    <div class="space-y-1">
      <label
        for="audit-retention"
        class="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {{ t('auditSettings.retention') }}
      </label>
      <select
        id="audit-retention"
        v-model.number="chosen"
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        data-testid="audit-retention"
      >
        <option v-for="option in retention.options" :key="option" :value="option">
          {{ t('auditSettings.option', { count: option }) }}
        </option>
      </select>
    </div>

    <div class="space-y-1">
      <label
        for="audit-password"
        class="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {{ t('auditSettings.password') }}
      </label>
      <input
        id="audit-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        data-testid="audit-password"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="busy || password.length === 0 || chosen === retention.maxEvents"
        :class="secondaryButton"
        data-testid="audit-save"
        @click="saveRetention"
      >
        {{ t('auditSettings.save') }}
      </button>
      <button
        v-if="!confirmingClear"
        type="button"
        :disabled="busy || password.length === 0"
        class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        data-testid="audit-clear"
        @click="confirmingClear = true"
      >
        {{ t('auditSettings.clear') }}
      </button>
    </div>

    <div
      v-if="confirmingClear"
      class="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      data-testid="audit-clear-confirm"
    >
      <p>{{ t('auditSettings.clearWarning') }}</p>
      <div class="flex gap-2">
        <button
          type="button"
          :disabled="busy"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          data-testid="audit-clear-confirm-button"
          @click="clearHistory"
        >
          {{ t('auditSettings.clearConfirm') }}
        </button>
        <button type="button" :class="secondaryButton" @click="cancelClear">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </section>
</template>
