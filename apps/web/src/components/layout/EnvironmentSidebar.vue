<script setup lang="ts">
/**
 * Barra lateral de ambientes: lista con conteos, creación, renombrado y
 * eliminación (con cascada de secretos).
 */
import AppIcon from '@/components/AppIcon.vue';
import type { EnvironmentDto } from '@secretvault/shared';
import { useDataStore } from '@/stores/data';

const emit = defineEmits<{
  'create-env': [];
  'rename-env': [env: EnvironmentDto];
  'delete-env': [env: EnvironmentDto];
}>();

const data = useDataStore();
</script>

<template>
  <aside
    class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 lg:w-64 lg:border-b-0 lg:border-r dark:border-zinc-800"
  >
    <div class="flex items-center justify-between px-4 pb-2 pt-4">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Ambientes
      </h2>
      <button
        type="button"
        class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
        title="Nuevo ambiente"
        aria-label="Crear ambiente"
        @click="emit('create-env')"
      >
        <AppIcon name="plus" :size="16" />
      </button>
    </div>

    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2" aria-label="Ambientes">
      <div v-for="env in data.environments" :key="env.id" class="group relative">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors"
          :class="
            env.id === data.activeEnvId && !data.isSearching
              ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/70'
          "
          @click="
            data.activeEnvId = env.id;
            data.query = '';
          "
        >
          <AppIcon name="folder" :size="16" class="shrink-0 opacity-70" />
          <span class="min-w-0 flex-1 truncate">{{ env.name }}</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
            :class="
              env.id === data.activeEnvId && !data.isSearching
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
            "
          >
            {{ env.secretCount }}
          </span>
        </button>

        <!-- Acciones al pasar el cursor -->
        <div
          class="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg bg-white p-0.5 shadow-sm group-hover:flex dark:bg-zinc-900"
        >
          <button
            type="button"
            class="rounded-md p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            :title="`Renombrar ${env.name}`"
            @click.stop="emit('rename-env', env)"
          >
            <AppIcon name="pencil" :size="14" />
          </button>
          <button
            type="button"
            class="rounded-md p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            :title="`Eliminar ${env.name}`"
            @click.stop="emit('delete-env', env)"
          >
            <AppIcon name="trash" :size="14" />
          </button>
        </div>
      </div>

      <p
        v-if="data.environments.length === 0 && !data.loadingEnvs"
        class="px-3 py-4 text-sm text-zinc-400"
      >
        Sin ambientes todavía.
      </p>
    </nav>

    <div class="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
      <div class="flex items-center gap-2 px-2 text-xs text-zinc-400 dark:text-zinc-500">
        <AppIcon name="shield" :size="14" class="text-emerald-500" />
        <span>AES-256-GCM · solo en RAM</span>
      </div>
    </div>
  </aside>
</template>
