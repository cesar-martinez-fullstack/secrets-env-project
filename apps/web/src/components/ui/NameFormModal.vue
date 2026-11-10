<script setup lang="ts">
import { ref, watch } from 'vue';
import { useToastStore } from '@/stores/toast';
import BaseModal from '@/components/ui/BaseModal.vue';

const props = defineProps<{
  open: boolean;
  title: string;
  placeholder: string;
  submitText: string;
  initialName: string;
  maxLength: number;
  save: (name: string) => Promise<void>;
}>();

const emit = defineEmits<{ close: [] }>();

const toast = useToastStore();
const name = ref('');
const submitting = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) name.value = props.initialName;
  },
);

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (!trimmed || submitting.value) return;
  submitting.value = true;
  try {
    await props.save(trimmed);
    emit('close');
  } catch (error) {
    toast.push('error', 'No se pudo guardar', error instanceof Error ? error.message : undefined);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="title" max-width="sm" @close="emit('close')">
    <form @submit.prevent="submit">
      <label for="name-form-input" class="label-text">Nombre</label>
      <input
        id="name-form-input"
        v-model="name"
        type="text"
        required
        autofocus
        :placeholder="placeholder"
        :maxlength="maxLength"
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
          {{ submitText }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
