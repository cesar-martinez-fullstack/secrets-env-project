<script setup lang="ts">
/**
 * Diálogo de confirmación con variante peligrosa (rojo) para acciones destructivas.
 */
const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <BaseModal :open="open" :title="title" max-width="sm" @close="emit('cancel')">
    <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{{ message }}</p>
    <div class="mt-6 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
        :class="
          danger
            ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
            : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500'
        "
        @click="emit('confirm')"
      >
        {{ confirmText ?? 'Confirmar' }}
      </button>
    </div>
  </BaseModal>
</template>
