<script setup lang="ts">
import { ref, watch } from 'vue';
import type { SharePreviewDto } from '@secretvault/shared';
import { api } from '@/lib/api';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import AppIcon from '@/components/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const data = useDataStore();
const toast = useToastStore();

const content = ref('');
const fileName = ref('');
const passphrase = ref('');
const preview = ref<SharePreviewDto | null>(null);
const busy = ref(false);

watch(
  () => props.open,
  () => {
    content.value = '';
    fileName.value = '';
    passphrase.value = '';
    preview.value = null;
  },
);

watch([content, passphrase], () => {
  preview.value = null;
});

async function pickFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  content.value = await file.text();
  fileName.value = file.name;
}

async function run<T>(work: () => Promise<T>, failure: string): Promise<T | null> {
  busy.value = true;
  try {
    return await work();
  } catch (error) {
    toast.push('error', failure, error instanceof Error ? error.message : undefined);
    return null;
  } finally {
    busy.value = false;
  }
}

async function openPackage(): Promise<void> {
  if (!content.value || !passphrase.value || busy.value) return;
  preview.value = await run(
    () => api.previewShare({ content: content.value, passphrase: passphrase.value }),
    'No se pudo abrir el archivo',
  );
}

async function confirmImport(): Promise<void> {
  if (!preview.value || busy.value) return;
  const result = await run(
    () => data.importShare(content.value, passphrase.value),
    'No se pudo importar',
  );
  if (!result) return;
  toast.push(
    'success',
    'Proyecto importado',
    `«${result.projectName}»: ${result.environmentCount} ambiente(s), ${result.secretCount} secreto(s).`,
  );
  emit('close');
}
</script>

<template>
  <BaseModal :open="open" title="Importar archivo compartido" max-width="md" @close="emit('close')">
    <div class="space-y-4" data-testid="share-import">
      <div v-if="!preview" class="space-y-4">
        <div>
          <label for="share-file" class="label-text">Archivo (.svshare)</label>
          <input
            id="share-file"
            type="file"
            accept=".svshare,application/json"
            class="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300"
            @change="pickFile"
          />
        </div>
        <div>
          <label for="share-import-passphrase" class="label-text">Frase de paso</label>
          <input
            id="share-import-passphrase"
            v-model="passphrase"
            type="password"
            autocomplete="off"
            class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
            @keydown.enter.prevent="openPackage"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            type="button"
            :disabled="!content || !passphrase || busy"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
            @click="openPackage"
          >
            Abrir archivo
          </button>
        </div>
      </div>

      <div v-else class="space-y-4">
        <p class="text-sm text-zinc-600 dark:text-zinc-400">
          Se creará un proyecto nuevo con este contenido
          <span v-if="fileName" class="font-mono text-xs">({{ fileName }})</span>:
        </p>
        <div class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p
            class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            data-testid="share-preview-project"
          >
            <AppIcon name="folder" :size="15" class="text-indigo-500" />
            {{ preview.projectName }}
          </p>
          <ul class="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <li v-for="env in preview.environments" :key="env.name" class="flex justify-between">
              <span>{{ env.name }}</span>
              <span class="tabular-nums text-zinc-400">{{ env.secretCount }} secreto(s)</span>
            </li>
          </ul>
          <p class="mt-3 text-xs text-zinc-400">
            Si ya tienes un proyecto con ese nombre, el nuevo llevará un número al final.
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            @click="preview = null"
          >
            Atrás
          </button>
          <button
            type="button"
            :disabled="busy"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
            @click="confirmImport"
          >
            Importar como proyecto nuevo
          </button>
        </div>
      </div>
    </div>
  </BaseModal>
</template>
