<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useThemeStore } from '@/stores/theme';
import { useSecurityStore } from '@/stores/security';
import ToastHost from '@/components/ui/ToastHost.vue';
import RecoveryKeyDialog from '@/components/vault/RecoveryKeyDialog.vue';

const settings = useSettingsStore();
const security = useSecurityStore();
useThemeStore();
onMounted(() => {
  void settings.load();
  // En la raíz: la clave de recuperación se muestra también fuera de la vista de la bóveda.
  document.addEventListener('copy', security.onManualCopy);
  window.addEventListener('sv:locked', () => void security.clearClipboard());
});
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
