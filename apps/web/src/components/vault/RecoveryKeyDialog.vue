<script setup lang="ts">
/**
 * Muestra la clave de recuperación UNA sola vez. El diálogo es bloqueante: no se puede cerrar
 * hasta que la persona confirme haberla guardado (el servidor no la conserva ni puede repetirla).
 */
import { computed, ref, watch } from 'vue';
import { useVaultStore } from '@/stores/vault';
import { useToastStore } from '@/stores/toast';
import { copyText } from '@/lib/clipboard';
import BaseModal from '@/components/ui/BaseModal.vue';
import AppIcon from '@/components/AppIcon.vue';

const vault = useVaultStore();
const toast = useToastStore();

const saved = ref(false);
const open = computed(() => vault.pendingRecoveryKey !== null);
const groups = computed(() => (vault.pendingRecoveryKey ?? '').split('-'));

watch(open, (isOpen) => {
  if (isOpen) saved.value = false;
});

async function copy(): Promise<void> {
  const key = vault.pendingRecoveryKey;
  if (!key) return;
  const ok = await copyText(key);
  toast.push(
    ok ? 'success' : 'error',
    ok ? 'Clave copiada' : 'No se pudo copiar',
    ok ? 'Pégala en un lugar seguro y bórrala del portapapeles.' : undefined,
  );
}

function download(): void {
  const key = vault.pendingRecoveryKey;
  if (!key) return;
  const text = [
    'SecretVault — clave de recuperación',
    '',
    key,
    '',
    'Guárdala fuera de este equipo (papel o gestor de confianza).',
    'Quien tenga esta clave puede abrir tu bóveda: no la compartas.',
    'Si usas la clave para recuperar el acceso, se genera una nueva y esta deja de funcionar.',
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'secretvault-clave-de-recuperacion.txt';
  link.click();
  URL.revokeObjectURL(url);
}

function confirmSaved(): void {
  if (!saved.value) return;
  vault.acknowledgeRecoveryKey();
  toast.push('success', 'Clave de recuperación guardada', 'Ya no se volverá a mostrar.');
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Guarda tu clave de recuperación"
    max-width="md"
    :dismissible="false"
  >
    <div data-testid="recovery-dialog" class="space-y-4">
      <p class="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Si olvidas tu contraseña maestra, esta clave es la <strong>única</strong> forma de recuperar
        tus secretos. Se muestra <strong>una sola vez</strong>: SecretVault no la guarda.
      </p>

      <div
        data-testid="recovery-key"
        class="grid grid-cols-4 gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 font-mono text-sm font-semibold tracking-wider text-indigo-900 select-all dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200"
        aria-label="Clave de recuperación"
      >
        <span v-for="(group, index) in groups" :key="index" class="text-center">{{ group }}</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="copy"
        >
          <AppIcon name="copy" :size="15" /> Copiar
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="download"
        >
          <AppIcon name="download" :size="15" /> Descargar .txt
        </button>
      </div>

      <div
        class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
      >
        <AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
        <span>
          Guárdala <strong>fuera de este equipo</strong> (papel o un gestor de confianza). Quien
          tenga esta clave puede abrir tu bóveda. Si la pierdes junto con la contraseña, los
          secretos son irrecuperables.
        </span>
      </div>

      <label
        class="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300"
      >
        <input
          id="recovery-saved"
          v-model="saved"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-zinc-300 text-indigo-600"
        />
        He guardado mi clave de recuperación en un lugar seguro.
      </label>

      <button
        id="recovery-continue"
        type="button"
        :disabled="!saved"
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        @click="confirmSaved"
      >
        Continuar
      </button>
    </div>
  </BaseModal>
</template>
