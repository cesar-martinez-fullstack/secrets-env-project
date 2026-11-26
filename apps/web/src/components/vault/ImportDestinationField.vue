<script setup lang="ts">
import { MAX_ENVIRONMENT_NAME_LENGTH } from '@secretvault/shared';
import type { ProjectDto } from '@secretvault/shared';
import type { ImportDestination } from '@/lib/import-destination';
import { useI18n } from '@/i18n/use-i18n';

defineProps<{
  projects: ProjectDto[];
  currentName: string | null;
}>();

const destination = defineModel<ImportDestination>({ required: true });
const { t } = useI18n();

function update(patch: Partial<ImportDestination>): void {
  destination.value = { ...destination.value, ...patch };
}

const field =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950';
const label = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400';
</script>

<template>
  <fieldset
    class="mt-4 space-y-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-700"
    data-testid="import-destination"
  >
    <legend :class="label">{{ t('import.destination') }}</legend>
    <label class="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
      <input
        type="radio"
        name="import-destination"
        class="accent-indigo-600"
        :checked="destination.mode === 'new'"
        data-testid="import-to-new"
        @change="update({ mode: 'new' })"
      />
      {{ t('import.toNew') }}
    </label>
    <div v-if="destination.mode === 'new'" class="grid gap-2 pl-6 sm:grid-cols-2">
      <div class="space-y-1">
        <label for="import-project" :class="label">{{ t('import.project') }}</label>
        <select
          id="import-project"
          :class="field"
          :value="destination.projectId"
          data-testid="import-project"
          @change="update({ projectId: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
      </div>
      <div class="space-y-1">
        <label for="import-env-name" :class="label">{{ t('import.envName') }}</label>
        <input
          id="import-env-name"
          type="text"
          :class="field"
          :maxlength="MAX_ENVIRONMENT_NAME_LENGTH"
          :value="destination.name"
          data-testid="import-env-name"
          @input="update({ name: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>
    <label
      v-if="currentName !== null"
      class="flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
    >
      <input
        type="radio"
        name="import-destination"
        class="accent-indigo-600"
        :checked="destination.mode === 'current'"
        data-testid="import-to-current"
        @change="update({ mode: 'current' })"
      />
      {{ t('import.toCurrent', { name: currentName }) }}
    </label>
  </fieldset>
</template>
