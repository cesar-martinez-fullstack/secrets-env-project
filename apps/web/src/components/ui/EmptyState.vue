<script setup lang="ts">
/**
 * Estado vacío elegante con icono, título y acción opcional.
 */
defineProps<{
  icon: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
    <div
      class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
    >
      <AppIcon :name="icon" :size="26" />
    </div>
    <h3 class="text-base font-semibold text-zinc-800 dark:text-zinc-200">{{ title }}</h3>
    <p v-if="description" class="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
