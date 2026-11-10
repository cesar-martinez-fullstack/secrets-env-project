<script setup lang="ts">
import { ref } from 'vue';
import type { EnvironmentDto, ProjectDto } from '@secretvault/shared';
import AppIcon from '@/components/AppIcon.vue';
import { useDataStore } from '@/stores/data';
import { useI18n } from '@/i18n/use-i18n';

const emit = defineEmits<{
  'create-project': [];
  'rename-project': [project: ProjectDto];
  'delete-project': [project: ProjectDto];
  'create-env': [project: ProjectDto];
  'rename-env': [env: EnvironmentDto];
  'delete-env': [env: EnvironmentDto];
  'share-project': [project: ProjectDto];
  'share-env': [env: EnvironmentDto];
  'import-share': [];
}>();

const data = useDataStore();
const { t } = useI18n();
const collapsed = ref(new Set<number>());

function toggle(projectId: number): void {
  const next = new Set(collapsed.value);
  if (!next.delete(projectId)) next.add(projectId);
  collapsed.value = next;
}

function select(env: EnvironmentDto): void {
  data.activeEnvId = env.id;
  data.query = '';
}

const isActive = (env: EnvironmentDto): boolean => env.id === data.activeEnvId && !data.isSearching;

const iconButton = 'rounded-md p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400';
</script>

<template>
  <aside
    class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 lg:w-64 lg:border-b-0 lg:border-r dark:border-zinc-800"
  >
    <div class="flex items-center justify-between px-4 pb-2 pt-4">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {{ t('sidebar.projects') }}
      </h2>
      <div class="flex items-center gap-0.5">
        <button
          type="button"
          class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
          :title="t('sidebar.importShare')"
          :aria-label="t('sidebar.importShare')"
          @click="emit('import-share')"
        >
          <AppIcon name="upload" :size="16" />
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
          :title="t('sidebar.newProject')"
          :aria-label="t('sidebar.createProject')"
          @click="emit('create-project')"
        >
          <AppIcon name="plus" :size="16" />
        </button>
      </div>
    </div>

    <nav
      class="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2"
      :aria-label="t('sidebar.navLabel')"
    >
      <section
        v-for="project in data.projects"
        :key="project.id"
        :data-testid="`project-${project.id}`"
      >
        <div class="group relative">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            :aria-expanded="!collapsed.has(project.id)"
            :aria-label="
              t('sidebar.projectSummary', { name: project.name, count: project.environmentCount })
            "
            @click="toggle(project.id)"
          >
            <AppIcon
              name="chevron-down"
              :size="14"
              class="shrink-0 text-zinc-400 transition-transform"
              :class="{ '-rotate-90': collapsed.has(project.id) }"
            />
            <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
            <span class="text-[11px] tabular-nums text-zinc-400">{{
              project.environmentCount
            }}</span>
          </button>

          <div
            class="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg bg-white p-0.5 shadow-sm group-hover:flex dark:bg-zinc-900"
          >
            <button
              type="button"
              :class="iconButton"
              :title="t('sidebar.newEnvIn', { name: project.name })"
              :aria-label="t('sidebar.newEnvIn', { name: project.name })"
              @click.stop="emit('create-env', project)"
            >
              <AppIcon name="plus" :size="14" />
            </button>
            <button
              type="button"
              :class="iconButton"
              :title="t('sidebar.shareTitle', { name: project.name })"
              :aria-label="t('sidebar.shareProject', { name: project.name })"
              @click.stop="emit('share-project', project)"
            >
              <AppIcon name="share" :size="14" />
            </button>
            <button
              type="button"
              :class="iconButton"
              :title="t('sidebar.renameTitle', { name: project.name })"
              :aria-label="t('sidebar.renameProject', { name: project.name })"
              @click.stop="emit('rename-project', project)"
            >
              <AppIcon name="pencil" :size="14" />
            </button>
            <button
              type="button"
              class="rounded-md p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
              :title="t('sidebar.deleteTitle', { name: project.name })"
              :aria-label="t('sidebar.deleteProject', { name: project.name })"
              @click.stop="emit('delete-project', project)"
            >
              <AppIcon name="trash" :size="14" />
            </button>
          </div>
        </div>

        <div
          v-show="!collapsed.has(project.id)"
          class="ml-3 flex flex-col gap-0.5 border-l border-zinc-200 pl-1.5 dark:border-zinc-800"
        >
          <div v-for="env in data.environmentsOf(project.id)" :key="env.id" class="group relative">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors"
              :class="
                isActive(env)
                  ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70'
              "
              @click="select(env)"
            >
              <AppIcon name="folder" :size="15" class="shrink-0 opacity-70" />
              <span class="min-w-0 flex-1 truncate">{{ env.name }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
                :class="
                  isActive(env)
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                "
              >
                {{ env.secretCount }}
              </span>
            </button>

            <div
              class="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg bg-white p-0.5 shadow-sm group-hover:flex dark:bg-zinc-900"
            >
              <button
                type="button"
                :class="iconButton"
                :title="t('sidebar.shareTitle', { name: env.name })"
                :aria-label="t('sidebar.shareEnv', { name: env.name })"
                @click.stop="emit('share-env', env)"
              >
                <AppIcon name="share" :size="14" />
              </button>
              <button
                type="button"
                :class="iconButton"
                :title="t('sidebar.renameTitle', { name: env.name })"
                @click.stop="emit('rename-env', env)"
              >
                <AppIcon name="pencil" :size="14" />
              </button>
              <button
                type="button"
                class="rounded-md p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                :title="t('sidebar.deleteTitle', { name: env.name })"
                @click.stop="emit('delete-env', env)"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </div>

          <p
            v-if="data.environmentsOf(project.id).length === 0"
            class="px-2.5 py-1.5 text-xs text-zinc-400"
          >
            {{ t('sidebar.noEnvs') }}
          </p>
        </div>
      </section>

      <p
        v-if="data.projects.length === 0 && !data.loadingEnvs"
        class="px-3 py-4 text-sm text-zinc-400"
      >
        {{ t('sidebar.noProjects') }}
      </p>
    </nav>

    <div class="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
      <div class="flex items-center gap-2 px-2 text-xs text-zinc-400 dark:text-zinc-500">
        <AppIcon name="shield" :size="14" class="text-emerald-500" />
        <span>{{ t('sidebar.footer') }}</span>
      </div>
    </div>
  </aside>
</template>
