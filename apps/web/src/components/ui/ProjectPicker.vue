<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ProjectDto } from '@secretvault/shared';
import AppIcon from '@/components/AppIcon.vue';
import { useI18n } from '@/i18n/use-i18n';

const props = defineProps<{
  modelValue: number | null;
  newLabel: string;
  projects: ProjectDto[];
}>();

const emit = defineEmits<{ 'update:modelValue': [id: number | null] }>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);
const expanded = ref(false);
const query = ref('');

const selectedLabel = computed(
  () => props.projects.find((project) => project.id === props.modelValue)?.name ?? props.newLabel,
);

const visibleProjects = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.projects.filter((project) => project.name.toLowerCase().includes(needle));
});

const showNewOption = computed(
  () =>
    query.value.trim() === '' ||
    props.newLabel.toLowerCase().includes(query.value.trim().toLowerCase()),
);

function toggle(): void {
  expanded.value = !expanded.value;
  query.value = '';
  if (expanded.value) setTimeout(() => search.value?.focus(), 0);
}

function pick(id: number | null): void {
  emit('update:modelValue', id);
  expanded.value = false;
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) expanded.value = false;
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

const optionClass = (active: boolean): string =>
  `flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
    active ? 'font-medium text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-300'
  }`;
</script>

<template>
  <div ref="root" class="relative" data-testid="project-picker">
    <button
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="expanded"
      class="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm dark:border-zinc-700 dark:bg-zinc-950"
      @click="toggle"
    >
      <span class="flex min-w-0 items-center gap-2">
        <AppIcon name="folder" :size="15" class="shrink-0 text-indigo-500" />
        <span class="truncate">{{ selectedLabel }}</span>
      </span>
      <AppIcon name="chevron-down" :size="14" class="shrink-0 text-zinc-400" />
    </button>

    <div
      v-if="expanded"
      class="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div class="border-b border-zinc-100 p-2 dark:border-zinc-800">
        <input
          ref="search"
          v-model="query"
          type="text"
          :placeholder="t('picker.search')"
          :aria-label="t('picker.search')"
          class="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
      <ul role="listbox" class="max-h-56 overflow-y-auto py-1">
        <li v-if="showNewOption" role="option" :aria-selected="modelValue === null">
          <button type="button" :class="optionClass(modelValue === null)" @click="pick(null)">
            <AppIcon name="plus" :size="14" class="shrink-0" />
            <span class="truncate">{{ newLabel }}</span>
          </button>
        </li>
        <li
          v-for="project in visibleProjects"
          :key="project.id"
          role="option"
          :aria-selected="modelValue === project.id"
        >
          <button
            type="button"
            :class="optionClass(modelValue === project.id)"
            @click="pick(project.id)"
          >
            <AppIcon name="folder" :size="14" class="shrink-0 opacity-70" />
            <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
            <span class="text-[11px] tabular-nums text-zinc-400">{{
              project.environmentCount
            }}</span>
          </button>
        </li>
        <li
          v-if="!showNewOption && visibleProjects.length === 0"
          class="px-3 py-2 text-sm text-zinc-400"
        >
          {{ t('picker.none') }}
        </li>
      </ul>
    </div>
  </div>
</template>
