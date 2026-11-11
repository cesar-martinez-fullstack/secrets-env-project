<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ACCENTS, APP_NAME_MAX_LENGTH, THEME_MODES } from '@secretvault/shared';
import type { Appearance } from '@secretvault/shared';
import { useI18n } from '@/i18n/use-i18n';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import BaseModal from '@/components/ui/BaseModal.vue';
import BrandMark from '@/components/ui/BrandMark.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const settings = useSettingsStore();
const toast = useToastStore();
const { t, describeError } = useI18n();

const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const draft = reactive<Appearance>({ ...settings.current });

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const { appName, accent, defaultTheme } = settings.current;
    Object.assign(draft, { appName, accent, defaultTheme });
  },
);

async function run(work: () => Promise<void>, success: string, failure: string): Promise<void> {
  busy.value = true;
  try {
    await work();
    toast.push('success', success);
  } catch (error) {
    toast.push('error', failure, describeError(error));
  } finally {
    busy.value = false;
  }
}

async function onFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (file) {
    await run(() => settings.uploadLogo(file), t('settings.logoSaved'), t('settings.logoFailed'));
  }
}

const saveAppearance = () =>
  run(
    () =>
      settings.updateAppearance({
        appName: draft.appName,
        accent: draft.accent,
        defaultTheme: draft.defaultTheme,
      }),
    t('settings.appearanceSaved'),
    t('settings.appearanceFailed'),
  );

const secondaryButton =
  'rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
const heading = 'text-sm font-semibold text-zinc-900 dark:text-zinc-100';
const fieldLabel = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400';
</script>

<template>
  <BaseModal :open="open" :title="t('settings.title')" max-width="md" @close="emit('close')">
    <div class="space-y-8">
      <section class="space-y-3" data-testid="settings-logo">
        <h3 :class="heading">{{ t('settings.logo') }}</h3>
        <div class="flex items-center gap-4">
          <BrandMark large />
          <div class="flex flex-wrap gap-2">
            <button type="button" :disabled="busy" :class="secondaryButton" @click="input?.click()">
              {{ settings.current.hasLogo ? t('settings.replace') : t('settings.choose') }}
            </button>
            <button
              v-if="settings.current.hasLogo"
              type="button"
              :disabled="busy"
              :class="secondaryButton"
              @click="
                run(
                  () => settings.removeLogo(),
                  t('settings.logoRemoved'),
                  t('settings.logoFailed'),
                )
              "
            >
              {{ t('settings.remove') }}
            </button>
          </div>
        </div>
        <input
          ref="input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="hidden"
          data-testid="logo-input"
          @change="onFile"
        />
        <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('settings.logoHint') }}</p>
        <p class="text-xs text-zinc-400">{{ t('settings.logoPublic') }}</p>
      </section>

      <form class="space-y-4" data-testid="settings-appearance" @submit.prevent="saveAppearance">
        <h3 :class="heading">{{ t('settings.appearance') }}</h3>

        <div class="space-y-1.5">
          <label for="settings-app-name" :class="fieldLabel">{{ t('settings.appName') }}</label>
          <input
            id="settings-app-name"
            v-model="draft.appName"
            type="text"
            :maxlength="APP_NAME_MAX_LENGTH"
            class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            data-testid="app-name-input"
          />
        </div>

        <fieldset class="space-y-1.5">
          <legend :class="fieldLabel">{{ t('settings.accent') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="accent in ACCENTS"
              :key="accent"
              class="cursor-pointer"
              :title="t(`settings.accent.${accent}`)"
            >
              <input
                v-model="draft.accent"
                type="radio"
                name="accent"
                :value="accent"
                class="peer sr-only"
                :aria-label="t(`settings.accent.${accent}`)"
                :data-testid="`accent-${accent}`"
              />
              <span
                class="block h-8 w-8 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-white peer-checked:ring-zinc-900 peer-focus-visible:ring-zinc-500 dark:ring-offset-zinc-900 dark:peer-checked:ring-zinc-100"
                :class="`accent-swatch-${accent}`"
              />
            </label>
          </div>
        </fieldset>

        <div class="space-y-1.5">
          <label for="settings-default-theme" :class="fieldLabel">
            {{ t('settings.defaultTheme') }}
          </label>
          <select
            id="settings-default-theme"
            v-model="draft.defaultTheme"
            class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            data-testid="default-theme-select"
          >
            <option v-for="mode in THEME_MODES" :key="mode" :value="mode">
              {{ t(`settings.theme.${mode}`) }}
            </option>
          </select>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t('settings.themeHint') }}</p>
        </div>

        <button
          type="submit"
          :disabled="busy"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          data-testid="save-appearance"
        >
          {{ t('settings.saveAppearance') }}
        </button>
      </form>
    </div>
  </BaseModal>
</template>
