<script setup lang="ts">
/**
 * Host de notificaciones (toasts). Aparecen arriba a la derecha con animación.
 */
import { useToastStore } from '@/stores/toast';
import type { ToastKind } from '@/stores/toast';
import AppIcon from '@/components/AppIcon.vue';
import type { IconName } from '@/components/icons';

const store = useToastStore();

const styles: Record<ToastKind, { icon: IconName; classes: string }> = {
  success: {
    icon: 'check',
    classes: 'border-emerald-300/60 text-emerald-700 dark:text-emerald-400',
  },
  error: { icon: 'alert', classes: 'border-red-300/60 text-red-700 dark:text-red-400' },
  info: { icon: 'info', classes: 'border-indigo-300/60 text-indigo-700 dark:text-indigo-400' },
};
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in store.toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 rounded-xl border bg-white/95 p-3.5 shadow-lg backdrop-blur dark:bg-zinc-900/95"
          :class="styles[toast.kind].classes"
        >
          <AppIcon :name="styles[toast.kind].icon" :size="18" class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ toast.title }}</p>
            <p v-if="toast.description" class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {{ toast.description }}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Descartar"
            @click="store.remove(toast.id)"
          >
            <AppIcon name="x" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.22s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px) scale(0.98);
}
</style>
