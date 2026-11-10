<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SharePreviewDto } from '@secretvault/shared';
import { api } from '@/lib/api';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';
import AppIcon from '@/components/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import ProjectPicker from '@/components/ui/ProjectPicker.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const data = useDataStore();
const toast = useToastStore();
const { t, describeError } = useI18n();

const content = ref('');
const fileName = ref('');
const passphrase = ref('');
const preview = ref<SharePreviewDto | null>(null);
const destination = ref<number | null>(null);
const separate = ref<string[]>([]);
const overwrite = ref(false);
const busy = ref(false);

const newProjectLabel = computed(() =>
  t('shareImport.newProject', { name: preview.value?.projectName ?? '' }),
);
const mergedConflicts = computed(
  () =>
    preview.value?.environments.filter(
      (env) => env.exists && !separate.value.includes(env.name) && env.conflicts.length > 0,
    ) ?? [],
);

function reset(): void {
  content.value = '';
  fileName.value = '';
  passphrase.value = '';
  preview.value = null;
  destination.value = null;
  separate.value = [];
  overwrite.value = false;
}

watch(() => props.open, reset);

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
    toast.push('error', failure, describeError(error));
    return null;
  } finally {
    busy.value = false;
  }
}

async function loadPreview(projectId: number | null): Promise<boolean> {
  const result = await run(
    () => api.previewShare({ content: content.value, passphrase: passphrase.value, projectId }),
    t('shareImport.openFailed'),
  );
  if (!result) return false;
  preview.value = result;
  destination.value = projectId;
  separate.value = [];
  overwrite.value = false;
  return true;
}

async function openPackage(): Promise<void> {
  if (!content.value || !passphrase.value || busy.value) return;
  await loadPreview(null);
}

async function changeDestination(projectId: number | null): Promise<void> {
  if (projectId === destination.value) return;
  await loadPreview(projectId);
}

function setMode(name: string, mode: 'merge' | 'separate'): void {
  const others = separate.value.filter((item) => item !== name);
  separate.value = mode === 'separate' ? [...others, name] : others;
}

async function confirmImport(): Promise<void> {
  if (!preview.value || busy.value) return;
  const result = await run(
    () =>
      data.importShare({
        content: content.value,
        passphrase: passphrase.value,
        projectId: destination.value,
        separateEnvironments: separate.value,
        overwrite: overwrite.value,
      }),
    t('shareImport.failed'),
  );
  if (!result) return;
  const parts = [t('import.created', { count: result.importedCount })];
  if (result.updatedCount > 0) parts.push(t('import.updated', { count: result.updatedCount }));
  if (result.skippedCount > 0) parts.push(t('import.skipped', { count: result.skippedCount }));
  toast.push(
    'success',
    t('shareImport.doneTitle'),
    t('shareImport.doneBody', { project: result.projectName, parts: parts.join(', ') }),
  );
  emit('close');
}

const secondaryButton =
  'rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
const primaryButton =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50';
</script>

<template>
  <BaseModal :open="open" :title="t('shareImport.title')" max-width="md" @close="emit('close')">
    <div class="space-y-4" data-testid="share-import">
      <div v-if="!preview" class="space-y-4">
        <div>
          <label for="share-file" class="label-text">{{ t('shareImport.file') }}</label>
          <input
            id="share-file"
            type="file"
            accept=".svshare,application/json"
            class="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300"
            @change="pickFile"
          />
        </div>
        <div>
          <label for="share-import-passphrase" class="label-text">{{
            t('shareImport.passphrase')
          }}</label>
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
          <button type="button" :class="secondaryButton" @click="emit('close')">
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            :disabled="!content || !passphrase || busy"
            :class="primaryButton"
            @click="openPackage"
          >
            {{ t('shareImport.open') }}
          </button>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div>
          <span class="label-text">{{ t('shareImport.importIn') }}</span>
          <ProjectPicker
            :model-value="destination"
            :new-label="newProjectLabel"
            :projects="data.projects"
            @update:model-value="changeDestination"
          />
          <p v-if="destination === null" class="mt-1.5 text-xs text-zinc-400">
            {{ t('shareImport.newProjectHint') }}
          </p>
        </div>

        <ul class="space-y-2" data-testid="share-environments">
          <li
            v-for="env in preview.environments"
            :key="env.name"
            class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                <AppIcon name="folder" :size="14" class="text-indigo-500" /> {{ env.name }}
              </span>
              <span class="text-xs tabular-nums text-zinc-400">{{
                t('shareImport.secrets', { count: env.secretCount })
              }}</span>
            </div>
            <template v-if="env.exists">
              <p class="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                {{ t('shareImport.exists') }}
              </p>
              <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <label class="flex items-center gap-1.5">
                  <input
                    type="radio"
                    :name="`mode-${env.name}`"
                    :checked="!separate.includes(env.name)"
                    @change="setMode(env.name, 'merge')"
                  />
                  {{ t('shareImport.merge') }}
                </label>
                <label class="flex items-center gap-1.5">
                  <input
                    type="radio"
                    :name="`mode-${env.name}`"
                    :checked="separate.includes(env.name)"
                    @change="setMode(env.name, 'separate')"
                  />
                  {{ t('shareImport.separate') }}
                </label>
              </div>
              <p
                v-if="env.conflicts.length > 0 && !separate.includes(env.name)"
                class="mt-2 text-xs text-zinc-500"
              >
                {{ t('shareImport.alreadyThere') }}
                <span class="font-mono">{{ env.conflicts.join(', ') }}</span>
              </p>
            </template>
            <p v-else-if="destination !== null" class="mt-1.5 text-xs text-zinc-400">
              {{ t('shareImport.willCreate') }}
            </p>
          </li>
        </ul>

        <fieldset v-if="mergedConflicts.length > 0" class="text-sm" data-testid="share-conflicts">
          <legend class="label-text">{{ t('shareImport.conflictLegend') }}</legend>
          <label class="mr-5 inline-flex items-center gap-1.5">
            <input v-model="overwrite" type="radio" name="overwrite" :value="false" />
            {{ t('shareImport.skip') }}
          </label>
          <label class="inline-flex items-center gap-1.5">
            <input v-model="overwrite" type="radio" name="overwrite" :value="true" />
            {{ t('shareImport.replace') }}
          </label>
        </fieldset>

        <p class="text-xs text-zinc-400">
          {{ t('shareImport.markNote') }}
        </p>

        <div class="flex justify-end gap-2">
          <button type="button" :class="secondaryButton" @click="preview = null">
            {{ t('common.back') }}
          </button>
          <button type="button" :disabled="busy" :class="primaryButton" @click="confirmImport">
            {{ t('shareImport.submit') }}
          </button>
        </div>
      </div>
    </div>
  </BaseModal>
</template>
