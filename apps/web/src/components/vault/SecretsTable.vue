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
import { useSecurityStore } from '@/stores/security';
import { moveId, shiftId } from '@/lib/sort';
import type { SortOrder } from '@/lib/sort';
import SortSelector from '@/components/vault/SortSelector.vue';
import ViewSelector from '@/components/vault/ViewSelector.vue';
import type { ViewMode } from '@/lib/view-mode';
import { relativeTime, absoluteTime } from '@/lib/time';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';

const props = defineProps<{
  secrets: SecretDto[];
  loading: boolean;
  selected: ReadonlySet<number>;
  order: SortOrder;
  reorderable: boolean;
  view: ViewMode;
  /** Hay más páginas: «seleccionar todos» abarca solo la que se ve. */
  paged: boolean;
}>();

const emit = defineEmits<{
  edit: [secret: SecretDto];
  remove: [secret: SecretDto];
  toggle: [id: number];
  'toggle-all': [];
  'set-order': [order: SortOrder];
  'set-view': [view: ViewMode];
  reorder: [ids: number[]];
  'clear-selection': [];
  'remove-selected': [];
  'share-selected': [];
  'create-first': [];
}>();

interface ViewClasses {
  list: string;
  row: string;
  name: string;
  badge: string;
  valueBox: string;
  value: string;
  actions: string;
}

const HOVER_ACTIONS =
  'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100';
const ROW_BADGE = 'hidden md:inline-block';
const DIVIDED = 'divide-y divide-zinc-100 dark:divide-zinc-800/80';

const VIEW_CLASSES = {
  list: {
    list: DIVIDED,
    row: 'flex-wrap gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap',
    name: 'flex-1',
    badge: ROW_BADGE,
    valueBox: 'shrink-0',
    value: 'max-w-[220px]',
    actions: HOVER_ACTIONS,
  },
  cards: {
    list: 'grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3',
    row: 'min-w-0 flex-wrap content-start gap-x-3 gap-y-2 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800',
    name: 'flex-1',
    badge: 'order-1 mr-auto',
    valueBox: 'min-w-0 basis-full',
    value: 'min-w-0 flex-1',
    actions: 'order-2 ml-auto',
  },
  compact: {
    list: DIVIDED,
    row: 'flex-wrap gap-x-3 gap-y-1 px-4 py-1 sm:flex-nowrap',
    name: 'flex flex-1 items-center gap-3',
    badge: ROW_BADGE,
    valueBox: 'shrink-0',
    value: 'max-w-[220px]',
    actions: HOVER_ACTIONS,
  },
} as const satisfies Record<ViewMode, ViewClasses>;

const layout = computed(() => VIEW_CLASSES[props.view]);

const allSelected = computed(
  () => props.secrets.length > 0 && props.secrets.every((secret) => props.selected.has(secret.id)),
);
const someSelected = computed(() => props.selected.size > 0 && !allSelected.value);
const selectAllLabel = computed(() => t(props.paged ? 'table.selectPage' : 'table.selectAll'));

const draggingId = ref<number | null>(null);
const orderedIds = computed(() => props.secrets.map((secret) => secret.id));

function dropOn(targetId: number): void {
  const dragged = draggingId.value;
  draggingId.value = null;
  if (dragged === null || dragged === targetId) return;
  emit('reorder', moveId(orderedIds.value, dragged, orderedIds.value.indexOf(targetId)));
}

function shift(id: number, delta: number): void {
  emit('reorder', shiftId(orderedIds.value, id, delta));
}

const toast = useToastStore();
const security = useSecurityStore();

function copiedBody(): string {
  const seconds = security.clipboardSeconds();
  return seconds > 0 ? t('table.copiedClears', { seconds }) : t('table.copiedBody');
}
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
  const ok = await security.copySensitive(value!);
  if (ok) {
    toast.push('success', t('table.copied', { name: secret.name }), copiedBody());
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
      class="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-2 text-xs dark:border-zinc-800"
      data-testid="selection-bar"
    >
      <input
        type="checkbox"
        class="h-4 w-4 rounded border-zinc-300 accent-indigo-600"
        :checked="allSelected"
        :indeterminate="someSelected"
        :aria-label="selectAllLabel"
        data-testid="select-all"
        @change="emit('toggle-all')"
      />
      <span class="text-zinc-500 dark:text-zinc-400">
        {{
          selected.size > 0 ? t('table.selectedCount', { count: selected.size }) : selectAllLabel
        }}
      </span>
      <ViewSelector class="ml-auto" :view="view" @change="emit('set-view', $event)" />
      <span class="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-zinc-700" aria-hidden="true" />
      <SortSelector :order="order" @change="emit('set-order', $event)" />
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
          class="rounded-lg px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          data-testid="share-selected"
          @click="emit('share-selected')"
        >
          {{ t('table.shareSelected') }}
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
    <ul :class="layout.list" :data-view="view" data-testid="secret-list">
      <li
        v-for="secret in secrets"
        :key="secret.id"
        class="group flex items-center transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
        :class="[layout.row, selected.has(secret.id) && 'bg-indigo-50/60 dark:bg-indigo-950/30']"
        :draggable="reorderable"
        data-testid="secret-row"
        @dragstart="draggingId = secret.id"
        @dragover.prevent="reorderable && draggingId !== null"
        @drop.prevent="dropOn(secret.id)"
        @dragend="draggingId = null"
      >
        <div v-if="reorderable" class="flex shrink-0 items-center text-zinc-400">
          <span class="cursor-grab" :title="t('table.dragHandle')" data-testid="drag-handle">
            <AppIcon name="grip" :size="15" />
          </span>
          <div class="flex flex-col">
            <button
              type="button"
              class="rounded p-0.5 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
              :aria-label="t('table.moveUp', { name: secret.name })"
              :disabled="secret.id === orderedIds[0]"
              data-testid="move-up"
              @click="shift(secret.id, -1)"
            >
              <AppIcon name="chevron-up" :size="13" />
            </button>
            <button
              type="button"
              class="rounded p-0.5 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
              :aria-label="t('table.moveDown', { name: secret.name })"
              :disabled="secret.id === orderedIds.at(-1)"
              data-testid="move-down"
              @click="shift(secret.id, 1)"
            >
              <AppIcon name="chevron-down" :size="13" />
            </button>
          </div>
        </div>
        <input
          type="checkbox"
          class="h-4 w-4 shrink-0 rounded border-zinc-300 accent-indigo-600"
          :checked="selected.has(secret.id)"
          :aria-label="t('table.select', { name: secret.name })"
          data-testid="select-secret"
          @change="emit('toggle', secret.id)"
        />
        <!-- Nombre (+ badge de ambiente en búsqueda global) -->
        <div class="min-w-0" :class="layout.name">
          <div class="flex min-w-0 items-center gap-2">
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
          <div
            class="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500"
            :class="view === 'compact' ? 'shrink-0' : 'mt-0.5'"
          >
            <span v-if="isRevealed(secret.id)" class="font-medium text-indigo-500">{{
              t('table.hidesIn', { seconds: secondsLeft[secret.id] ?? 0 })
            }}</span>
            <span
              v-if="view !== 'compact'"
              :title="absoluteTime(secret.updatedAt, localeStore.locale)"
              >{{
                t('table.edited', { time: relativeTime(secret.updatedAt, localeStore.locale) })
              }}</span
            >
          </div>
        </div>

        <!-- Badge de ambiente (solo en búsqueda global) -->
        <span
          class="max-w-full shrink-0 truncate rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          :class="layout.badge"
        >
          {{ secret.projectName }} › {{ secret.environmentName }}
        </span>

        <!-- Valor enmascarado / revelado -->
        <div class="flex items-center gap-1" :class="layout.valueBox">
          <Transition name="reveal" mode="out-in">
            <code
              v-if="isRevealed(secret.id)"
              :key="'v' + secret.id"
              :class="layout.value"
              class="truncate rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-300"
            >
              {{ revealed.get(secret.id)?.value }}
            </code>
            <code
              v-else
              :key="'m' + secret.id"
              :class="layout.value"
              class="truncate select-none rounded-lg px-2.5 py-1 font-mono text-xs tracking-widest text-zinc-400 dark:text-zinc-500"
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
        <div class="flex shrink-0 items-center gap-1" :class="layout.actions">
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
