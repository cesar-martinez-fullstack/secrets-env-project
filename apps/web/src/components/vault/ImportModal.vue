<script setup lang="ts">
/**
 * Modal de importación masiva: pega el contenido de un .env y se parsea
 * localmente (paquete shared) mostrando un resumen antes de importar.
 */
import { computed, ref, watch } from 'vue';
import { detectImportFormat, parseImportFile } from '@secretvault/shared';
import { formatJson, looksLikeJson, tokenizeJson } from '@/lib/json-highlight';
import type { JsonTokenKind } from '@/lib/json-highlight';
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

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const content = ref('');
const fileName = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const overwrite = ref(false);
const submitting = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    clearFile();
    overwrite.value = false;
  },
);

const TOKEN_CLASSES: Record<JsonTokenKind, string> = {
  key: 'text-sky-700 dark:text-sky-300',
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-amber-700 dark:text-amber-400',
  literal: 'text-violet-700 dark:text-violet-400',
  punctuation: 'text-zinc-400 dark:text-zinc-500',
  space: '',
};

const sourceName = computed(
  () => fileName.value ?? (looksLikeJson(content.value) ? 'pegado.json' : 'pegado.env'),
);

const parsed = computed(() =>
  content.value.trim().length === 0 ? null : parseImportFile(sourceName.value, content.value),
);

const formattedJson = computed(() =>
  parsed.value?.format === 'json' && !parsed.value.unreadable ? formatJson(content.value) : null,
);
const jsonTokens = computed(() =>
  formattedJson.value === null ? [] : tokenizeJson(formattedJson.value),
);

const preview = computed(() => {
  if (!parsed.value) return null;
  const { entries, invalid, duplicates, unreadable } = parsed.value;
  return {
    valid: entries.length,
    invalid,
    duplicates,
    unreadable,
    withNotes: entries.filter((entry) => entry.note !== null).length,
  };
});

const canSubmit = computed(() => (parsed.value?.entries.length ?? 0) > 0 && !submitting.value);

function clearFile(): void {
  content.value = '';
  fileName.value = null;
}

async function onFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    toast.push('error', t('import.failed'), t('import.tooLarge'));
    return;
  }
  const text = await file.text();
  const isJson = detectImportFormat(file.name) === 'json';
  content.value = isJson ? (formatJson(text) ?? text) : text;
  fileName.value = file.name;
}

async function submit(): Promise<void> {
  const entries = parsed.value?.entries;
  if (!entries?.length || data.activeEnvId === null || submitting.value) return;
  submitting.value = true;
  try {
    const result = await data.importSecrets(data.activeEnvId, entries, overwrite.value);
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

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        data-testid="import-choose-file"
        @click="fileInput?.click()"
      >
        {{ t('import.chooseFile') }}
      </button>
      <span
        v-if="fileName"
        class="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
        data-testid="import-file-name"
      >
        {{ fileName }}
        <button
          type="button"
          class="rounded-full hover:text-sky-900 dark:hover:text-sky-100"
          :aria-label="t('import.removeFile')"
          @click="clearFile"
        >
          <AppIcon name="x" :size="12" />
        </button>
      </span>
      <span v-else class="text-xs text-zinc-400">{{ t('import.fileHint') }}</span>
      <input
        ref="fileInput"
        type="file"
        accept=".env,.txt,.csv,.json,text/plain,text/csv,application/json"
        class="hidden"
        data-testid="import-file-input"
        @change="onFile"
      />
    </div>

    <textarea
      v-if="fileName === null"
      v-model="content"
      rows="9"
      spellcheck="false"
      placeholder="DATABASE_URL=postgres://user:pass@localhost:5432/db&#10;API_KEY=sk_live_...&#10;DEBUG=true"
      class="w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
    />

    <pre
      v-if="formattedJson !== null"
      class="mt-3 max-h-64 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
      data-testid="import-json-preview"
    ><code><span v-for="(token, index) in jsonTokens" :key="index" :class="TOKEN_CLASSES[token.kind]">{{ token.text }}</span></code></pre>
    <pre
      v-else-if="fileName !== null"
      class="max-h-64 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
      data-testid="import-file-preview"
      >{{ content }}</pre>

    <div v-if="preview" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span
        v-if="preview.unreadable"
        class="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-950/60 dark:text-red-400"
        data-testid="import-unreadable"
      >
        {{ t('import.unreadable') }}
      </span>
      <span
        v-if="preview.withNotes > 0"
        class="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {{ t('import.withNotes', { count: preview.withNotes }) }}
      </span>
      <span
        v-if="!preview.unreadable"
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
        :disabled="!canSubmit"
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
