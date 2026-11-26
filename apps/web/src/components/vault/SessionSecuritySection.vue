<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { SessionSecurityValuesDto } from '@secretvault/shared';
import { useI18n } from '@/i18n/use-i18n';
import type { MessageKey } from '@/i18n/catalogs';
import { useSecurityStore } from '@/stores/security';
import { useToastStore } from '@/stores/toast';
import { useVaultStore } from '@/stores/vault';

const { t, describeError } = useI18n();
const toast = useToastStore();
const security = useSecurityStore();
const vault = useVaultStore();

const chosen = reactive<SessionSecurityValuesDto>({
  autoLockMinutes: 0,
  sessionMaxMinutes: 0,
  clipboardClearSeconds: 0,
});
const password = ref('');
const busy = ref(false);

const FIELDS: { key: keyof SessionSecurityValuesDto; label: MessageKey }[] = [
  { key: 'autoLockMinutes', label: 'sessionSettings.autoLock' },
  { key: 'sessionMaxMinutes', label: 'sessionSettings.maxSession' },
  { key: 'clipboardClearSeconds', label: 'sessionSettings.clipboard' },
];

const changed = computed(() => FIELDS.some(({ key }) => chosen[key] !== security.settings?.[key]));

/** El valor vigente se ofrece aunque venga del entorno y no esté entre las opciones. */
function optionsOf(key: keyof SessionSecurityValuesDto): number[] {
  const current = security.settings;
  if (!current) return [];
  return [...new Set([...current.options[key], current[key]])].sort((a, b) => a - b);
}

function describe(key: keyof SessionSecurityValuesDto, value: number): string {
  if (key === 'clipboardClearSeconds') {
    return value === 0 ? t('sessionSettings.off') : t('sessionSettings.seconds', { count: value });
  }
  if (key === 'sessionMaxMinutes' && value % 60 === 0) {
    return t('sessionSettings.hours', { count: value / 60 });
  }
  return t('sessionSettings.minutes', { count: value });
}

function reset(): void {
  const current = security.settings;
  if (current) for (const { key } of FIELDS) chosen[key] = current[key];
}

async function load(): Promise<void> {
  try {
    await security.load();
    reset();
  } catch (error) {
    toast.push('error', t('sessionSettings.failed'), describeError(error));
  }
}

async function save(): Promise<void> {
  if (password.value.length === 0 || busy.value) return;
  busy.value = true;
  try {
    await security.save({ ...chosen, currentPassword: password.value });
    toast.push('success', t('sessionSettings.saved'));
    await vault.refreshStatus();
  } catch (error) {
    toast.push('error', t('sessionSettings.failed'), describeError(error));
  } finally {
    password.value = '';
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <form
    v-if="security.settings"
    class="space-y-3"
    data-testid="settings-session"
    @submit.prevent="save"
  >
    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      {{ t('sessionSettings.title') }}
    </h3>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('sessionSettings.body') }}</p>

    <div v-for="field in FIELDS" :key="field.key" class="space-y-1">
      <label
        :for="`session-${field.key}`"
        class="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {{ t(field.label) }}
      </label>
      <select
        :id="`session-${field.key}`"
        v-model.number="chosen[field.key]"
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        :data-testid="`session-${field.key}`"
      >
        <option v-for="value in optionsOf(field.key)" :key="value" :value="value">
          {{ describe(field.key, value) }}
        </option>
      </select>
    </div>
    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('sessionSettings.clipboardNote') }}</p>

    <div class="space-y-1">
      <label
        for="session-password"
        class="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {{ t('sessionSettings.password') }}
      </label>
      <input
        id="session-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        data-testid="session-password"
      />
    </div>

    <button
      type="submit"
      :disabled="busy || !changed || password.length === 0"
      class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
      data-testid="session-save"
    >
      {{ t('sessionSettings.save') }}
    </button>
  </form>
</template>
