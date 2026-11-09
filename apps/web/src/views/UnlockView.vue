<script setup lang="ts">
/**
 * Pantalla de entrada: configura la contraseña maestra (primer uso) o
 * desbloquea la bóveda. La clave deriva en el servidor vía PBKDF2 y jamás
 * se persiste.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { passwordStrength } from '@secretvault/shared';
import { useVaultStore } from '@/stores/vault';
import { useToastStore } from '@/stores/toast';
import AppIcon from '@/components/AppIcon.vue';

const router = useRouter();
const vault = useVaultStore();
const toast = useToastStore();

const password = ref('');
const confirm = ref('');
const busy = ref(false);
const showPassword = ref(false);
const error = ref<string | null>(null);
const ready = ref(false);

const strength = computed(() => passwordStrength(password.value));
const strengthLabels = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Excelente'];
const strengthColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-emerald-500',
];

const canSubmit = computed(() => {
  if (vault.initialized) return password.value.length > 0;
  return password.value.length >= 10 && password.value === confirm.value;
});

onMounted(async () => {
  await vault.refreshStatus().catch(() => null);
  if (vault.unlocked) {
    await router.replace('/vault');
  }
  ready.value = true;
});

async function submit(): Promise<void> {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (vault.initialized) {
      await vault.unlock(password.value);
      toast.push(
        'success',
        'Bóveda desbloqueada',
        `Auto-lock en ${vault.autoLockMinutes} min de inactividad.`,
      );
    } else {
      await vault.setup(password.value);
      toast.push(
        'success',
        'Bóveda creada',
        'Tu contraseña maestra deriva la clave AES-256 en RAM.',
      );
    }
    await router.replace('/vault');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error desconocido';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    class="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950"
    :style="{
      backgroundImage: 'radial-gradient(60% 50% at 50% 0%, rgba(79,70,229,0.07), transparent 70%)',
    }"
  >
    <Transition name="pop" appear>
      <div v-if="ready" class="card w-full max-w-sm p-8">
        <!-- Logo -->
        <div class="mb-8 flex flex-col items-center text-center">
          <div
            class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
          >
            <AppIcon :name="vault.initialized ? 'unlock' : 'lock'" :size="26" />
          </div>
          <h1 class="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            SecretVault
          </h1>
          <p class="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {{
              vault.initialized
                ? 'Tu bóveda está bloqueada. Ingresa tu contraseña maestra.'
                : 'Crea la contraseña maestra que protegerá todos tus secretos.'
            }}
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="submit">
          <div>
            <label for="master-password" class="label-text">
              {{ vault.initialized ? 'Contraseña maestra' : 'Nueva contraseña maestra' }}
            </label>
            <div class="relative">
              <input
                id="master-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                autofocus
                autocomplete="current-password"
                placeholder="••••••••••"
                class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 pr-10 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                @click="showPassword = !showPassword"
              >
                <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="15" />
              </button>
            </div>

            <!-- Medidor de fuerza (solo en setup) -->
            <div v-if="!vault.initialized && password.length > 0" class="mt-2">
              <div class="flex gap-1">
                <div
                  v-for="i in 4"
                  :key="i"
                  class="h-1 flex-1 rounded-full transition-colors duration-300"
                  :class="i <= strength ? strengthColors[strength] : 'bg-zinc-200 dark:bg-zinc-800'"
                />
              </div>
              <p class="mt-1 text-xs text-zinc-400">{{ strengthLabels[strength] }}</p>
            </div>
          </div>

          <div v-if="!vault.initialized">
            <label for="confirm-password" class="label-text">Confirmar contraseña</label>
            <input
              id="confirm-password"
              v-model="confirm"
              type="password"
              required
              autocomplete="new-password"
              placeholder="••••••••••"
              class="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p v-if="confirm.length > 0 && confirm !== password" class="mt-1 text-xs text-red-500">
              Las contraseñas no coinciden.
            </p>
          </div>

          <p
            v-if="error"
            class="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
          >
            <AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
            {{ error }}
          </p>

          <button
            type="submit"
            :disabled="!canSubmit || busy"
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AppIcon v-if="busy" name="loader" :size="16" class="animate-spin" />
            {{ vault.initialized ? 'Desbloquear' : 'Crear bóveda' }}
          </button>
        </form>

        <div
          v-if="!vault.initialized"
          class="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400"
        >
          <AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />
          <span>
            Sin recuperación: si olvidas esta contraseña los secretos cifrados son
            <strong>irrecuperables</strong> por diseño. La clave solo existe en RAM.
          </span>
        </div>

        <p class="mt-6 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">
          PBKDF2-SHA256 · AES-256-GCM · clave nunca persistida
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pop-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.pop-enter-from {
  opacity: 0;
  transform: translateY(14px) scale(0.97);
}
</style>
