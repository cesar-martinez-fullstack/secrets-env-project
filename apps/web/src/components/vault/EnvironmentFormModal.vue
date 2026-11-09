<script setup lang="ts">
/**
 * Modal para crear o renombrar un ambiente.
 */
import { ref, watch } from 'vue';
import type { EnvironmentDto } from '@secretvault/shared';
import { useDataStore } from '@/stores/data';
import { useToastStore } from '@/stores/toast';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps<{
  open: boolean;
  editing: EnvironmentDto | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const data = useDataStore();
const toast = useToastStore();

const name = ref('');
const submitting = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.editing?.name ?? '';
  },
);

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (!trimmed || submitting.value) return;
  submitting.value = true;
  try {
    if (props.editing) {
      await data.renameEnvironment(props.editing.id, trimmed);
      toast.push('success', 'Ambiente renombrado', `Ahora se llama «${trimmed}».`);
    } else {
      await data.addEnvironment(trimmed);
      toast.push('success', 'Ambiente creado', `«${trimmed}» está listo para recibir secretos.`);
    }
    emit('close');
  } catch (error) {
    toast.push('error', 'No se pudo guardar', error instanceof Error ? error.message : undefined);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="editing ? 'Renombrar ambiente' : 'Nuevo ambiente'"
    max-width="sm"
    @close="emit('close')"
  >
    <form @submit.prevent="submit">
      <label for="env-name" class="label-text">Nombre</label>
      <input
        id="env-name"
        v-model="name"
        type="text"
        required
        autofocus
        placeholder="ej. Production, QA, Staging…"
        maxlength="40"
        class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="submitting"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
        >
          {{ editing ? 'Guardar' : 'Crear ambiente' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
