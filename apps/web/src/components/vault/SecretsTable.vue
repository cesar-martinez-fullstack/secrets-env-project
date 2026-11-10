<script setup lang="ts">
/**
 * Tabla de secretos: valores enmascarados por defecto, revelado progresivo
 * con auto-ocultado a los 10s, copiado con toast y acciones por fila.
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import type { SecretDto } from '@secretvault/shared';
import AppIcon from '@/components/AppIcon.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { relativeTime, absoluteTime } from '@/lib/time';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{
  secrets: SecretDto[];
  loading: boolean;
}>();

const emit = defineEmits<{
  edit: [secret: SecretDto];
  remove: [secret: SecretDto];
  'create-first': [];
}>();

const toast = useToastStore();

interface Revealed {
  value: string;
  note: string | null;
  hideAt: number;
}

const revealed = reactive(new Map<number, Revealed>());
const nowTick = ref(Date.now());
const copyBusy = reactive(new Set<number>());

let ticker: ReturnType<typeof setInterval> | null = null;

function ensureTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    nowTick.value = Date.now();
    for (const [id, info] of revealed) {
      if (info.hideAt <= nowTick.value) revealed.delete(id);
    }
    if (revealed.size === 0) {
      if (ticker) clearInterval(ticker);
      ticker = null;
    }
  }, 500);
}

function stopTicker(): void {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

onBeforeUnmount(stopTicker);

function isRevealed(id: number): boolean {
  return revealed.has(id);
}

const secondsLeft = computed(() => {
  const map: Record<number, number> = {};
  for (const [id, info] of revealed) {
    map[id] = Math.max(0, Math.ceil((info.hideAt - nowTick.value) / 1000));
  }
  return map;
});

async function toggleReveal(secret: SecretDto): Promise<void> {
  if (revealed.has(secret.id)) {
    revealed.delete(secret.id);
    return;
  }
  try {
    const detail = await api.revealSecret(secret.id);
    revealed.set(secret.id, {
      value: detail.value,
      note: detail.note,
      hideAt: Date.now() + 10_000,
    });
    ensureTicker();
  } catch (error) {
    toast.push('error', 'No se pudo revelar', error instanceof Error ? error.message : undefined);
  }
}

function hide(secret: SecretDto): void {
  revealed.delete(secret.id);
}

async function copySecret(secret: SecretDto): Promise<void> {
  let value = revealed.get(secret.id)?.value;
  if (value === undefined) {
    copyBusy.add(secret.id);
    try {
      const detail = await api.revealSecret(secret.id);
      value = detail.value;
    } catch (error) {
      copyBusy.delete(secret.id);
      toast.push('error', 'No se pudo copiar', error instanceof Error ? error.message : undefined);
      return;
    }
    copyBusy.delete(secret.id);
  }
  const ok = await copyText(value!);
  if (ok) {
    toast.push(
      'success',
      `${secret.name} copiado al portapapeles`,
      'El valor está disponible para pegar.',
    );
  } else {
    toast.push('error', 'No se pudo copiar', 'Tu navegador bloqueó el acceso al portapapeles.');
  }
}
</script>

<template>
  <div
    v-if="loading && secrets.length === 0"
    class="flex items-center justify-center py-20 text-zinc-400"
  >
    <AppIcon name="loader" :size="22" class="animate-spin" />
  </div>

  <EmptyState
    v-else-if="secrets.length === 0"
    icon="database"
    title="Este ambiente está vacío"
    description="Crea tu primera variable de entorno o importa un archivo .env completo."
  >
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98]"
      @click="emit('create-first')"
    >
      <AppIcon name="plus" :size="16" />
      Crear secreto
    </button>
  </EmptyState>

  <div v-else class="overflow-hidden">
    <ul class="divide-y divide-zinc-100 dark:divide-zinc-800/80">
      <li
        v-for="secret in secrets"
        :key="secret.id"
        class="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-zinc-50/80 sm:flex-nowrap dark:hover:bg-zinc-800/40"
      >
        <!-- Nombre (+ badge de ambiente en búsqueda global) -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="truncate font-mono text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"
            >
              {{ secret.name }}
            </span>
            <span v-if="secret.hasNote" title="Tiene nota" class="text-amber-500/80">
              <AppIcon name="sticky" :size="13" />
            </span>
          </div>
          <div class="mt-0.5 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <span v-if="isRevealed(secret.id)" class="font-medium text-indigo-500"
              >se oculta en {{ secondsLeft[secret.id] ?? 0 }}s</span
            >
            <span :title="absoluteTime(secret.updatedAt)"
              >editado {{ relativeTime(secret.updatedAt) }}</span
            >
          </div>
        </div>

        <!-- Badge de ambiente (solo en búsqueda global) -->
        <span
          class="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 md:inline-block"
        >
          {{ secret.projectName }} › {{ secret.environmentName }}
        </span>

        <!-- Valor enmascarado / revelado -->
        <div class="flex shrink-0 items-center gap-1">
          <Transition name="reveal" mode="out-in">
            <code
              v-if="isRevealed(secret.id)"
              :key="'v' + secret.id"
              class="max-w-[220px] truncate rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-300"
            >
              {{ revealed.get(secret.id)?.value }}
            </code>
            <code
              v-else
              :key="'m' + secret.id"
              class="select-none rounded-lg px-2.5 py-1 font-mono text-xs tracking-widest text-zinc-400 dark:text-zinc-500"
            >
              {{ secret.maskedValue }}
            </code>
          </Transition>

          <button
            type="button"
            class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
            :title="isRevealed(secret.id) ? 'Ocultar valor' : 'Revelar valor (10s)'"
            @click="toggleReveal(secret)"
          >
            <AppIcon :name="isRevealed(secret.id) ? 'eye-off' : 'eye'" :size="15" />
          </button>

          <button
            type="button"
            class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
            :title="'Copiar valor'"
            :disabled="copyBusy.has(secret.id)"
            @click="copySecret(secret)"
          >
            <AppIcon
              :name="copyBusy.has(secret.id) ? 'loader' : 'copy'"
              :size="15"
              :class="{ 'animate-spin': copyBusy.has(secret.id) }"
            />
          </button>
        </div>

        <!-- Acciones -->
        <div
          class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        >
          <button
            type="button"
            class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400"
            title="Editar secreto"
            @click="emit('edit', secret)"
          >
            <AppIcon name="pencil" :size="15" />
          </button>
          <button
            type="button"
            class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
            title="Eliminar secreto"
            @click="emit('remove', secret)"
          >
            <AppIcon name="trash" :size="15" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.reveal-enter-active,
.reveal-leave-active {
  transition: all 0.25s ease;
}
.reveal-enter-from {
  filter: blur(5px);
  opacity: 0.4;
}
.reveal-leave-to {
  filter: blur(5px);
  opacity: 0;
}
</style>
