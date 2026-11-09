<script setup lang="ts">
/**
 * Seguridad de la cuenta: cambiar la contraseña maestra y regenerar la clave de recuperación.
 * Ambas acciones exigen la contraseña actual.
 */
import { computed, ref, watch } from 'vue';
import { passwordStrength } from '@secretvault/shared';
import { useVaultStore } from '@/stores/vault';
import { useToastStore } from '@/stores/toast';
import BaseModal from '@/components/ui/BaseModal.vue';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const vault = useVaultStore();
const toast = useToastStore();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const busy = ref<'password' | 'recovery' | null>(null);
const error = ref<string | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    error.value = null;
  },
);

const strength = computed(() => passwordStrength(newPassword.value));
const canChange = computed(
  () =>
    currentPassword.value.length > 0 &&
    newPassword.value.length >= 10 &&
    newPassword.value === confirmPassword.value,
);

async function run(kind: 'password' | 'recovery', action: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = kind;
  error.value = null;
  try {
    await action();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error desconocido';
  } finally {
    busy.value = null;
  }
}

function changePassword(): Promise<void> {
  return run('password', async () => {
    await vault.changeMasterPassword(currentPassword.value, newPassword.value);
    toast.push(
      'success',
      'Contraseña actualizada',
      'Tus secretos no cambiaron: solo se re-envolvió la clave.',
    );
    emit('close');
  });
}

function regenerateRecoveryKey(): Promise<void> {
  return run('recovery', async () => {
    await vault.regenerateRecoveryKey(currentPassword.value);
    emit('close'); // el diálogo global muestra la clave nueva
  });
}
</script>

<template>
  <BaseModal :open="open" title="Seguridad" max-width="md" @close="emit('close')">
    <div class="space-y-5" data-testid="security-modal">
      <div>
        <label for="sec-current" class="label-text">Contraseña maestra actual</label>
        <input
          id="sec-current"
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>

      <section class="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Cambiar la contraseña maestra
        </h3>
        <div>
          <label for="sec-new" class="label-text">Nueva contraseña</label>
          <input
            id="sec-new"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p v-if="newPassword.length > 0" class="mt-1 text-xs text-zinc-400">
            Fuerza: {{ ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Excelente'][strength] }}
          </p>
        </div>
        <div>
          <label for="sec-confirm" class="label-text">Confirmar nueva contraseña</label>
          <input
            id="sec-confirm"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p
            v-if="confirmPassword.length > 0 && confirmPassword !== newPassword"
            class="mt-1 text-xs text-red-500"
          >
            Las contraseñas no coinciden.
          </p>
        </div>
        <button
          id="sec-change"
          type="button"
          :disabled="!canChange || busy !== null"
          class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="changePassword"
        >
          <AppIcon v-if="busy === 'password'" name="loader" :size="15" class="animate-spin" />
          Cambiar contraseña
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Clave de recuperación
        </h3>
        <p class="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Genera una clave nueva. La anterior dejará de funcionar de inmediato. Úsalo si crees que
          la clave quedó expuesta o si la perdiste (y aún conoces tu contraseña).
        </p>
        <button
          id="sec-regenerate"
          type="button"
          :disabled="currentPassword.length === 0 || busy !== null"
          class="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          @click="regenerateRecoveryKey"
        >
          <AppIcon v-if="busy === 'recovery'" name="loader" :size="15" class="animate-spin" />
          <AppIcon v-else name="key" :size="15" />
          Generar clave nueva
        </button>
      </section>

      <p
        v-if="error"
        data-testid="security-error"
        class="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
      >
        <AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
        {{ error }}
      </p>
    </div>
  </BaseModal>
</template>
