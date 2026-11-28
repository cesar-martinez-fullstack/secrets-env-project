<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EnvironmentDto } from '@secretvault/shared';
import BaseModal from '@/components/ui/BaseModal.vue';
import ProjectPicker from '@/components/ui/ProjectPicker.vue';
import { useI18n } from '@/i18n/use-i18n';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{ environment: EnvironmentDto | null }>();
const emit = defineEmits<{ close: [] }>();

const data = useDataStore();
const toast = useToastStore();
const { t, describeError } = useI18n();
const destination = ref<number | null>(null);
const submitting = ref(false);

const targets = computed(() =>
  data.projects.filter((project) => project.id !== props.environment?.projectId),
);

watch(
  () => props.environment,
  () => (destination.value = null),
);

async function submit(): Promise<void> {
  const { environment } = props;
  const project = targets.value.find((item) => item.id === destination.value);
  if (!environment || !project || submitting.value) return;
  submitting.value = true;
  try {
    await data.moveEnvironment(environment.id, project.id);
    const names = { name: environment.name, project: project.name };
    toast.push('success', t('moveEnv.doneTitle'), t('moveEnv.doneBody', names));
    emit('close');
  } catch (error) {
    toast.push('error', t('moveEnv.failed'), describeError(error));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="environment !== null"
    :title="t('moveEnv.title', { name: environment?.name ?? '' })"
    max-width="sm"
    @close="emit('close')"
  >
    <form class="space-y-4" data-testid="move-environment" @submit.prevent="submit">
      <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {{ t('moveEnv.lead', { count: environment?.secretCount ?? 0 }) }}
      </p>
      <div class="min-h-72">
        <span class="label-text">{{ t('moveEnv.destination') }}</span>
        <ProjectPicker
          v-model="destination"
          :allow-new="false"
          :new-label="t('moveEnv.choose')"
          :projects="targets"
        />
      </div>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="submit"
          :disabled="destination === null || submitting"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
        >
          {{ t('moveEnv.submit') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
