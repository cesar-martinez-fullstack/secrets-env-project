<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import ToastHost from '@/components/ui/ToastHost.vue';
import RecoveryKeyDialog from '@/components/vault/RecoveryKeyDialog.vue';

const settings = useSettingsStore();
onMounted(() => void settings.load());
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="view" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <RecoveryKeyDialog />
  <ToastHost />
</template>

<style scoped>
.view-enter-active,
.view-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.view-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
