<script setup lang="ts">
/**
 * Muestra la clave de recuperación UNA sola vez. El diálogo es bloqueante: no se puede cerrar
 * hasta que la persona confirme haberla guardado (el servidor no la conserva ni puede repetirla).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useVaultStore } from '@/stores/vault';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';
import { copyText } from '@/lib/clipboard';
import { saveTextFile } from '@/lib/download';
import { warnBeforeUnload } from '@/lib/before-unload';
import BaseModal from '@/components/ui/BaseModal.vue';
import AppIcon from '@/components/AppIcon.vue';

const vault = useVaultStore();
const toast = useToastStore();
const { t } = useI18n();

const saved = ref(false);
const open = computed(() => vault.pendingRecoveryKey !== null);
const groups = computed(() => (vault.pendingRecoveryKey ?? '').split('-'));

watch(open, (isOpen) => {
  if (isOpen) {
    saved.value = false;
    window.addEventListener('beforeunload', warnBeforeUnload);
  } else {
    window.removeEventListener('beforeunload', warnBeforeUnload);
  }
});

onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));

async function copy(): Promise<void> {
  const key = vault.pendingRecoveryKey;
  if (!key) return;
  const ok = await copyText(key);
  toast.push(
    ok ? 'success' : 'error',
    ok ? t('recovery.copiedTitle') : t('recovery.copyFailed'),
    ok ? t('recovery.copiedBody') : undefined,
  );
}

function download(): void {
  const key = vault.pendingRecoveryKey;
  if (!key) return;
  const text = [
    t('recovery.fileTitle'),
    '',
    key,
    '',
    t('recovery.fileLine1'),
    t('recovery.fileLine2'),
    t('recovery.fileLine3'),
    '',
  ].join('\n');
  saveTextFile(t('recovery.fileName'), text);
}

function confirmSaved(): void {
  if (!saved.value) return;
  vault.acknowledgeRecoveryKey();
  toast.push('success', t('recovery.confirmedTitle'), t('recovery.confirmedBody'));
}
</script>

<template>
  <BaseModal :open="open" :title="t('recovery.title')" max-width="md" :dismissible="false">
    <div data-testid="recovery-dialog" class="space-y-4">
      <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {{ t('recovery.leadStart') }} <strong>{{ t('recovery.leadOnly') }}</strong>
        {{ t('recovery.leadMiddle') }} <strong>{{ t('recovery.leadOnce') }}</strong
        >{{ t('recovery.leadEnd') }}
      </p>

      <div
        data-testid="recovery-key"
        class="grid grid-cols-4 gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 font-mono text-sm font-semibold tracking-wider text-indigo-900 select-all dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200"
        :aria-label="t('recovery.keyLabel')"
      >
        <span v-for="(group, index) in groups" :key="index" class="text-center">{{ group }}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="copy"
        >
          <AppIcon name="copy" :size="15" /> {{ t('recovery.copy') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="download"
        >
          <AppIcon name="download" :size="15" /> {{ t('recovery.download') }}
        </button>
      </div>

      <div
        class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
      >
        <AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
        <span>
          {{ t('recovery.warnStart') }} <strong>{{ t('recovery.warnOutside') }}</strong>
          {{ t('recovery.warnEnd') }}
        </span>
      </div>

      <label
        class="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300"
      >
        <input
          id="recovery-saved"
          v-model="saved"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600"
        />
        {{ t('recovery.saved') }}
      </label>

      <button
        id="recovery-continue"
        type="button"
        :disabled="!saved"
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        @click="confirmSaved"
      >
        {{ t('recovery.continue') }}
      </button>
    </div>
  </BaseModal>
</template>
