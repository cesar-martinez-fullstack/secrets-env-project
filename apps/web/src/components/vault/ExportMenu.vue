<script setup lang="ts">
/**
 * Menú de exportación del ambiente activo: .env, CSV y PDF estilizado.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { EXPORT_FORMATS } from '@secretvault/shared';
import type { ExportFormat } from '@secretvault/shared';
import AppIcon from '@/components/AppIcon.vue';
import { useDataStore } from '@/stores/data';

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const data = useDataStore();

const META: Record<
  ExportFormat,
  { icon: 'download' | 'file-text'; label: string; description: string }
> = {
  env: { icon: 'download', label: 'Archivo .env', description: 'Formato dotenv estándar' },
  csv: { icon: 'download', label: 'Hoja CSV', description: 'Compatible con Excel / Sheets' },
  pdf: { icon: 'file-text', label: 'Reporte PDF', description: 'Estilizado, apto para imprimir' },
};

function exportAs(format: ExportFormat): void {
  if (data.activeEnvId === null) return;
  const url = `/api/secrets/export?environmentId=${data.activeEnvId}&format=${format}`;
  window.location.assign(url);
  open.value = false;
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      :disabled="data.activeEnvId === null"
      @click="open = !open"
    >
      <AppIcon name="download" :size="15" />
      Exportar
    </button>

    <Transition name="menu">
      <div
        v-if="open"
        class="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <button
          v-for="format in EXPORT_FORMATS"
          :key="format"
          type="button"
          class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
          @click="exportAs(format)"
        >
          <AppIcon :name="META[format].icon" :size="16" class="text-indigo-500" />
          <span>
            <span class="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{{
              META[format].label
            }}</span>
            <span class="block text-xs text-zinc-400">{{ META[format].description }}</span>
          </span>
        </button>
        <p
          class="border-t border-zinc-100 px-4 py-2 text-[11px] leading-snug text-zinc-400 dark:border-zinc-800"
        >
          El archivo descargado contiene secretos en texto claro. Manéjalo con cuidado.
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition: all 0.14s ease;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
