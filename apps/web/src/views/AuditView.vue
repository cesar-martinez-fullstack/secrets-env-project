<script setup lang="ts">
/**
 * Vista de auditoría: historial local de eventos con paginación incremental.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AuditEventDto, AuditEventType } from '@secretvault/shared';
import { api } from '@/lib/api';
import { relativeTime, absoluteTime } from '@/lib/time';
import AppIcon from '@/components/AppIcon.vue';
import type { IconName } from '@/components/icons';
import EmptyState from '@/components/ui/EmptyState.vue';

const router = useRouter();

const events = ref<AuditEventDto[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const PAGE_SIZE = 60;

const ICON_PER_TYPE: Partial<Record<AuditEventType, IconName>> = {
  'vault.setup': 'shield',
  'vault.unlock': 'unlock',
  'vault.unlock_failed': 'alert',
  'vault.lock': 'lock',
  'vault.password_changed': 'key',
  'env.created': 'folder',
  'env.renamed': 'pencil',
  'env.deleted': 'trash',
  'secret.created': 'plus',
  'secret.updated': 'pencil',
  'secret.deleted': 'trash',
  'secret.revealed': 'eye',
  'secret.imported': 'upload',
  'secret.exported': 'download',
};

const COLOR_PER_TYPE: Partial<Record<AuditEventType, string>> = {
  'vault.unlock_failed': 'text-red-500 bg-red-50 dark:bg-red-950/50',
  'env.deleted': 'text-red-500 bg-red-50 dark:bg-red-950/50',
  'secret.deleted': 'text-red-500 bg-red-50 dark:bg-red-950/50',
  'secret.revealed': 'text-amber-500 bg-amber-50 dark:bg-amber-950/50',
  'secret.exported': 'text-amber-500 bg-amber-50 dark:bg-amber-950/50',
};

async function loadMore(): Promise<void> {
  loadingMore.value = true;
  try {
    const result = await api.listAudit(PAGE_SIZE, events.value.length);
    events.value.push(...result.events);
    total.value = result.total;
  } finally {
    loadingMore.value = false;
  }
}

const canLoadMore = computed(() => events.value.length < total.value);

onMounted(async () => {
  await loadMore();
  loading.value = false;
});
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <header
      class="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80"
    >
      <div class="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title="Volver a la bóveda"
          @click="router.push('/vault')"
        >
          <AppIcon name="arrow-left" />
        </button>
        <h1 class="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Historial de auditoría
        </h1>
        <span
          v-if="total > 0"
          class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          {{ total }} evento(s)
        </span>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div v-if="loading" class="flex justify-center py-16 text-zinc-400">
        <AppIcon name="loader" :size="22" class="animate-spin" />
      </div>

      <div v-else-if="events.length === 0" class="card">
        <EmptyState
          icon="history"
          title="Sin eventos todavía"
          description="Aquí se registrarán creaciones, ediciones, borrados, revelados y exportaciones."
        />
      </div>

      <div v-else class="card divide-y divide-zinc-100 dark:divide-zinc-800/80">
        <div v-for="event in events" :key="event.id" class="flex items-start gap-3 px-4 py-3">
          <span
            class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800"
            :class="COLOR_PER_TYPE[event.type]"
          >
            <AppIcon :name="ICON_PER_TYPE[event.type] ?? 'clock'" :size="15" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm leading-snug text-zinc-700 dark:text-zinc-300">{{ event.message }}</p>
            <p class="mt-0.5 text-xs text-zinc-400" :title="absoluteTime(event.createdAt)">
              {{ relativeTime(event.createdAt) }} · {{ event.type }}
            </p>
          </div>
        </div>

        <div v-if="canLoadMore" class="p-4">
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            :disabled="loadingMore"
            @click="loadMore"
          >
            <AppIcon v-if="loadingMore" name="loader" :size="15" class="animate-spin" />
            Cargar más
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
