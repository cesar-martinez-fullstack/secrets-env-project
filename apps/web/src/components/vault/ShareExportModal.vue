<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SHARE_MIN_PASSPHRASE } from '@secretvault/shared';
import { api } from '@/lib/api';
import { saveTextFile } from '@/lib/download';
import { generateSecretValue } from '@/lib/generate';
import { useToastStore } from '@/stores/toast';
import AppIcon from '@/components/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import type { ShareTarget } from './share-target';

const props = defineProps<{
  open: boolean;
  target: ShareTarget | null;
}>();

const emit = defineEmits<{ close: [] }>();

const toast = useToastStore();
const passphrase = ref('');
const visible = ref(false);
const submitting = ref(false);

const GENERATED_LENGTH = 20;
const canSubmit = computed(() => passphrase.value.length >= SHARE_MIN_PASSPHRASE);
const scopeLabel = computed(() =>
  props.target?.kind === 'projects' ? 'el proyecto completo' : 'este ambiente',
);

watch(
  () => props.open,
  () => {
    passphrase.value = '';
    visible.value = false;
  },
);

function generate(): void {
  passphrase.value = generateSecretValue(GENERATED_LENGTH);
  visible.value = true;
}

async function submit(): Promise<void> {
  if (!props.target || !canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const file = await api.exportShare(props.target.kind, props.target.id, passphrase.value);
    saveTextFile(file.filename, file.content);
    toast.push(
      'success',
      'Archivo generado',
      'Envía la frase de paso a la otra persona por un canal distinto al del archivo.',
    );
    emit('close');
  } catch (error) {
    toast.push('error', 'No se pudo compartir', error instanceof Error ? error.message : undefined);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="`Compartir «${target?.name ?? ''}»`"
    max-width="md"
    @close="emit('close')"
  >
    <form class="space-y-4" data-testid="share-export-form" @submit.prevent="submit">
      <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Se genera un archivo cifrado con {{ scopeLabel }}, sus ambientes y sus secretos. Quien lo
        reciba necesita la frase de paso para abrirlo en su SecretVault.
      </p>

      <div>
        <label for="share-passphrase" class="label-text">Frase de paso</label>
        <div class="flex gap-2">
          <input
            id="share-passphrase"
            v-model="passphrase"
            :type="visible ? 'text' : 'password'"
            autocomplete="off"
            required
            :minlength="SHARE_MIN_PASSPHRASE"
            class="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            class="rounded-xl border border-zinc-200 px-3 text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            :title="visible ? 'Ocultar' : 'Mostrar'"
            :aria-label="visible ? 'Ocultar la frase' : 'Mostrar la frase'"
            @click="visible = !visible"
          >
            <AppIcon :name="visible ? 'eye-off' : 'eye'" :size="16" />
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            @click="generate"
          >
            <AppIcon name="dice" :size="15" /> Generar
          </button>
        </div>
        <p class="mt-1.5 text-xs text-zinc-400">
          Mínimo {{ SHARE_MIN_PASSPHRASE }} caracteres. SecretVault no la guarda: si se pierde, el
          archivo no se puede abrir.
        </p>
      </div>

      <div
        class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
      >
        <AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
        <span>
          Quien tenga el archivo y la frase tendrá acceso a estos secretos y no se puede revocar.
          Comparte la frase por un canal distinto al del archivo.
        </span>
      </div>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="!canSubmit || submitting"
          class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
        >
          <AppIcon name="download" :size="15" /> Descargar archivo
        </button>
      </div>
    </form>
  </BaseModal>
</template>
