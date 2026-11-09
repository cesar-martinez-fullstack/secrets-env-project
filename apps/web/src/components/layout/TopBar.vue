<script setup lang="ts">
/**
 * Barra superior: marca, buscador global en tiempo real, acciones de tema,
 * auditoría, bloqueo y creación de secretos.
 */
import AppIcon from '@/components/AppIcon.vue';
import { useDataStore } from '@/stores/data';
import { useThemeStore } from '@/stores/theme';

const emit = defineEmits<{
  'create-secret': [];
  lock: [];
}>();

const data = useDataStore();
const theme = useThemeStore();
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80"
  >
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
      <!-- Marca -->
      <RouterLink to="/vault" class="flex items-center gap-2.5" title="SecretVault">
        <span
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
        >
          <AppIcon name="lock" :size="18" />
        </span>
        <span
          class="hidden text-[15px] font-semibold tracking-tight text-zinc-900 sm:block dark:text-zinc-100"
        >
          SecretVault
        </span>
      </RouterLink>

      <!-- Buscador global -->
      <div class="relative mx-auto w-full max-w-md">
        <AppIcon
          name="search"
          :size="16"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          v-model="data.query"
          type="search"
          placeholder="Buscar en todos los ambientes…"
          autocomplete="off"
          spellcheck="false"
          class="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-9 text-sm text-zinc-800 placeholder-zinc-400 transition-colors focus:border-indigo-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:bg-zinc-900"
        />
        <button
          v-if="data.query"
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          aria-label="Limpiar búsqueda"
          @click="data.query = ''"
        >
          <AppIcon name="x" :size="14" />
        </button>
      </div>

      <!-- Acciones -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="`Tema: ${theme.mode}`"
          aria-label="Cambiar tema"
          @click="theme.cycle()"
        >
          <AppIcon :name="theme.mode === 'system' ? 'monitor' : theme.isDark ? 'moon' : 'sun'" />
        </button>

        <RouterLink
          to="/audit"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Historial de auditoría"
        >
          <AppIcon name="history" />
        </RouterLink>

        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Bloquear bóveda"
          @click="emit('lock')"
        >
          <AppIcon name="log-out" />
        </button>

        <button
          type="button"
          class="ml-1 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.98]"
          @click="emit('create-secret')"
        >
          <AppIcon name="plus" :size="16" />
          <span class="hidden sm:inline">Nuevo secreto</span>
        </button>
      </div>
    </div>
  </header>
</template>
