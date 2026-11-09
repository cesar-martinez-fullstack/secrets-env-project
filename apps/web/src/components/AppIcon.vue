<script setup lang="ts">
import { ICONS, type IconName } from './icons';

defineProps<{
  name: IconName;
  size?: number;
}>();
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="ICONS[name].join('')"
  />
</template>
