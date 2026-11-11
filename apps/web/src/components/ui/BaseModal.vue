<script setup lang="ts">
/**
 * Modal base: teleport, overlay con blur, cierre por Escape y clic externo,
 * transición suave y bloqueo de scroll del body.
 */
import { onBeforeUnmount, watch } from 'vue';
import { useI18n } from '@/i18n/use-i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
    /** `false` = no se cierra con Escape, clic externo ni botón (diálogos que exigen una acción). */
    dismissible?: boolean;
  }>(),
  { maxWidth: 'md', dismissible: true },
);

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const maxClass = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

function requestClose() {
  if (props.dismissible) emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) requestClose();
}

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('overflow-hidden', open);
    if (open) {
      window.addEventListener('keydown', onKeydown);
    } else {
      window.removeEventListener('keydown', onKeydown);
    }
  },
);

onBeforeUnmount(() => {
  document.body.classList.remove('overflow-hidden');
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-950/45 p-4 backdrop-blur-sm sm:items-center"
        @click.self="requestClose"
      >
        <div
          class="card w-full p-6 shadow-xl"
          :class="maxClass[maxWidth]"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="mb-4 flex items-start justify-between gap-4">
            <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{{ title }}</h2>
            <button
              v-if="dismissible"
              type="button"
              class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <AppIcon name="x" />
            </button>
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-active .card,
.modal-leave-active .card {
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .card,
.modal-leave-to .card {
  transform: scale(0.97) translateY(4px);
}
</style>
