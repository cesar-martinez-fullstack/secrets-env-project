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
import type { SortOrder } from '@/lib/sort';
import { relativeTime, absoluteTime } from '@/lib/time';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';

const props = defineProps<{
  secrets: SecretDto[];
  loading: boolean;
  selected: ReadonlySet<number>;
  order: SortOrder;
}>();

const emit = defineEmits<{
  edit: [secret: SecretDto];
  remove: [secret: SecretDto];
  toggle: [id: number];
  'toggle-all': [];
  'toggle-sort': [];
  'clear-selection': [];
  'remove-selected': [];
  'create-first': [];
}>();

const allSelected = computed(
  () => props.secrets.length > 0 && props.secrets.every((secret) => props.selected.has(secret.id)),
);
const someSelected = computed(() => props.selected.size > 0 && !allSelected.value);

const toast = useToastStore();
const { t, describeError, localeStore } = useI18n();

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
    toast.push('error', t('table.revealFailed'), describeError(error));
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
      toast.push('error', t('table.copyFailed'), describeError(error));
      return;
    }
    copyBusy.delete(secret.id);
  }
  const ok = await copyText(value!);
  if (ok) {
    toast.push('success', t('table.copied', { name: secret.name }), t('table.copiedBody'));
  } else {
    toast.push('error', t('table.copyFailed'), t('table.clipboardBlocked'));
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
    :title="t('table.emptyTitle')"
    :description="t('table.emptyDescription')"
  >
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98]"
      @click="emit('create-first')"
    >
      <AppIcon name="plus" :size="16" />
      {{ t('table.createSecret') }}
    </button>
  </EmptyState>

  <div v-else class="overflow-hidden">
    <div
      class="flex items-center gap-3 border-b border-zinc-100 px-4 py-2 text-xs dark:border-zinc-800"
      data-testid="selection-bar"
    >
      <input
        type="checkbox"
        class="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
        :checked="allSelected"
        :indeterminate="someSelected"
        :aria-label="t('table.selectAll')"
        data-testid="select-all"
        @change="emit('toggle-all')"
      />
      <span class="text-zinc-500 dark:text-zinc-400">
        {{
          selected.size > 0
            ? t('table.selectedCount', { count: selected.size })
            : t('table.selectAll')
        }}
      </span>
      <button
        type="button"
        class="ml-auto rounded-lg px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        :title="t('table.sortTitle')"
        data-testid="toggle-sort"
        @click="emit('toggle-sort')"
      >
        {{ order === 'asc' ? t('table.sortAsc') : t('table.sortDesc') }}
      </button>
      <template v-if="selected.size > 0">
        <button
          type="button"
          class="rounded-lg px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          data-testid="clear-selection"
          @click="emit('clear-selection')"
        >
          {{ t('table.clearSelection') }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
          data-testid="delete-selected"
          @click="emit('remove-selected')"
        >
          {{ t('table.deleteSelected') }}
        </button>
      </template>
    </div>
    <ul class="divide-y divide-zinc-100 dark:divide-zinc-800/80">
      <li
        v-for="secret in secrets"
        :key="secret.id"
        class="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-zinc-50/80 sm:flex-nowrap dark:hover:bg-zinc-800/40"
        :class="selected.has(secret.id) && 'bg-indigo-50/60 dark:bg-indigo-950/30'"
      >
        <input
          type="checkbox"
          class="h-4 w-4 shrink-0 rounded border-zinc-300 accent-indigo-600"
          :checked="selected.has(secret.id)"
          :aria-label="t('table.select', { name: secret.name })"
          data-testid="select-secret"
          @change="emit('toggle', secret.id)"
        />
        <!-- Nombre (+ badge de ambiente en búsqueda global) -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="truncate font-mono text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"
            >
              {{ secret.name }}
            </span>
            <span
              v-if="secret.importedAt"
              :title="
                t('table.importedTitle', {
                  date: absoluteTime(secret.importedAt, localeStore.locale),
                })
              "
              class="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
              data-testid="imported-badge"
            >
              {{ t('table.imported') }}
            </span>
            <span v-if="secret.hasNote" :title="t('table.hasNote')" class="text-amber-500/80">
              <AppIcon name="sticky" :size="13" />
            </span>
          </div>
          <div class="mt-0.5 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <span v-if="isRevealed(secret.id)" class="font-medium text-indigo-500">{{
              t('table.hidesIn', { seconds: secondsLeft[secret.id] ?? 0 })
            }}</span>
            <span :title="absoluteTime(secret.updatedAt, localeStore.locale)">{{
              t('table.edited', { time: relativeTime(secret.updatedAt, localeStore.locale) })
            }}</span>
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
            :title="isRevealed(secret.id) ? t('table.hide') : t('table.reveal')"
            @click="toggleReveal(secret)"
          >
            <AppIcon :name="isRevealed(secret.id) ? 'eye-off' : 'eye'" :size="15" />
          </button>

          <button
            type="button"
            class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
            :title="t('table.copy')"
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
            :title="t('table.edit')"
            @click="emit('edit', secret)"
          >
            <AppIcon name="pencil" :size="15" />
          </button>
          <button
            type="button"
            class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
            :title="t('table.delete')"
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
