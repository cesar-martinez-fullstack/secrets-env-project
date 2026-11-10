<script setup lang="ts">
/**
 * Modal de importación masiva: pega el contenido de un .env y se parsea
 * localmente (paquete shared) mostrando un resumen antes de importar.
 */
import { computed, ref, watch } from 'vue';
import { parseEnvContent } from '@secretvault/shared';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';
import AppIcon from '@/components/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const data = useDataStore();
const toast = useToastStore();
const { t, describeError } = useI18n();

const content = ref('');
const overwrite = ref(false);
const submitting = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    content.value = '';
    overwrite.value = false;
  },
);

const preview = computed(() => {
  if (content.value.trim().length === 0) return null;
  const parsed = parseEnvContent(content.value);
  return {
    valid: parsed.entries.length,
    invalid: parsed.invalidLines,
    duplicates: parsed.duplicates,
  };
});

async function submit(): Promise<void> {
  if (!content.value.trim() || data.activeEnvId === null || submitting.value) return;
  submitting.value = true;
  try {
    const result = await data.importSecrets(data.activeEnvId, content.value, overwrite.value);
    const parts: string[] = [];
    if (result.imported > 0) parts.push(t('import.created', { count: result.imported }));
    if (result.updated > 0) parts.push(t('import.updated', { count: result.updated }));
    if (result.skipped > 0) parts.push(t('import.skipped', { count: result.skipped }));
    toast.push(
      'success',
      t('import.doneTitle'),
      parts.length > 0
        ? t('import.summary', { parts: parts.join(', '), env: data.activeEnv?.name ?? '' })
        : t('import.nothingChanged'),
    );
    emit('close');
  } catch (error) {
    toast.push('error', t('import.failed'), describeError(error));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="t('import.title')" max-width="lg" @close="emit('close')">
    <p class="mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
      {{ t('import.leadStart') }}
      <code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">.env</code>
      {{ t('import.leadMiddle') }}
      <strong class="font-semibold text-zinc-700 dark:text-zinc-300"
        >«{{ data.activeEnv?.name }}»</strong
      >{{ t('import.leadEnd') }}
    </p>

    <textarea
      v-model="content"
      rows="9"
      spellcheck="false"
      placeholder="DATABASE_URL=postgres://user:pass@localhost:5432/db&#10;API_KEY=sk_live_...&#10;DEBUG=true"
      class="w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
    />

    <div v-if="preview" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span
        class="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
      >
        {{ t('import.valid', { count: preview.valid }) }}
      </span>
      <span
        v-if="preview.duplicates > 0"
        class="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
      >
        {{ t('import.duplicates', { count: preview.duplicates }) }}
      </span>
      <span
        v-if="preview.invalid > 0"
        class="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-950/60 dark:text-red-400"
      >
        {{ t('import.invalid', { count: preview.invalid }) }}
      </span>
    </div>

    <label
      class="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700"
    >
      <input v-model="overwrite" type="checkbox" class="mt-0.5 h-4 w-4 accent-indigo-600" />
      <span>
        <span class="font-medium text-zinc-700 dark:text-zinc-300">{{
          t('import.overwrite')
        }}</span>
        <span class="block text-xs text-zinc-400">{{ t('import.overwriteHint') }}</span>
      </span>
    </label>

    <div class="mt-5 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        @click="emit('close')"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        :disabled="!content.trim() || submitting"
        class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        @click="submit"
      >
        <AppIcon v-if="submitting" name="loader" :size="15" class="animate-spin" />
        <AppIcon v-else name="upload" :size="15" />
        {{ t('import.submit') }}
      </button>
    </div>
  </BaseModal>
</template>
