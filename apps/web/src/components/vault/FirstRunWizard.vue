<script setup lang="ts">
import { computed, ref } from 'vue';
import { ACCENTS, APP_NAME_MAX_LENGTH, THEME_MODES, isValidAppName } from '@secretvault/shared';
import { useI18n } from '@/i18n/use-i18n';
import { useFirstRunStore } from '@/stores/first-run';
import { useToastStore } from '@/stores/toast';
import AppearancePreview from '@/components/vault/AppearancePreview.vue';

const TOTAL_STEPS = 2;

const firstRun = useFirstRunStore();
const toast = useToastStore();
const { t, localeStore } = useI18n();

const step = ref<1 | 2>(1);
const input = ref<HTMLInputElement | null>(null);
const nameIsValid = computed(() => isValidAppName(firstRun.draft.appName));

async function onFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  try {
    await firstRun.chooseLogo(file);
  } catch {
    toast.push('error', t('wizard.logoInvalid'));
  }
}

const primaryButton =
  'rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
const fieldLabel = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400';
const textField =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950';
</script>

<template>
  <div class="card w-full max-w-2xl p-8" data-testid="first-run-wizard">
    <p class="mb-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
      {{ t('wizard.step', { current: step, total: TOTAL_STEPS }) }}
    </p>

    <template v-if="step === 1">
      <h1 class="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {{ t('wizard.welcomeTitle') }}
      </h1>
      <p class="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{{ t('wizard.welcomeBody') }}</p>

      <div class="mt-6 space-y-5">
        <fieldset class="space-y-1.5">
          <legend :class="fieldLabel">{{ t('wizard.language') }}</legend>
          <div class="flex gap-2">
            <button
              v-for="locale in ['es', 'en'] as const"
              :key="locale"
              type="button"
              :class="[
                secondaryButton,
                localeStore.locale === locale &&
                  'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300',
              ]"
              :aria-pressed="localeStore.locale === locale"
              :data-testid="`wizard-locale-${locale}`"
              @click="localeStore.setLocale(locale)"
            >
              {{ t(`wizard.lang.${locale}`) }}
            </button>
          </div>
        </fieldset>

        <div class="space-y-1.5">
          <label for="wizard-app-name" :class="fieldLabel">{{ t('settings.appName') }}</label>
          <input
            id="wizard-app-name"
            v-model="firstRun.draft.appName"
            type="text"
            :maxlength="APP_NAME_MAX_LENGTH"
            :class="textField"
            data-testid="wizard-app-name"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <h1 class="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {{ t('wizard.lookTitle') }}
      </h1>
      <p class="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{{ t('wizard.lookBody') }}</p>

      <div class="mt-6 grid gap-6 md:grid-cols-[1fr_18rem]">
        <div class="space-y-5">
          <div class="space-y-1.5">
            <span :class="fieldLabel">{{ t('settings.logo') }}</span>
            <div class="flex flex-wrap gap-2">
              <button type="button" :class="secondaryButton" @click="input?.click()">
                {{ t('wizard.logoChoose') }}
              </button>
              <button
                v-if="firstRun.logo"
                type="button"
                :class="secondaryButton"
                @click="firstRun.clearLogo()"
              >
                {{ t('wizard.logoRemove') }}
              </button>
            </div>
            <input
              ref="input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="hidden"
              data-testid="wizard-logo-input"
              @change="onFile"
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
                  v-model="firstRun.draft.accent"
                  type="radio"
                  name="wizard-accent"
                  :value="accent"
                  class="peer sr-only"
                  :aria-label="t(`settings.accent.${accent}`)"
                  :data-testid="`wizard-accent-${accent}`"
                />
                <span
                  class="block h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-white peer-checked:ring-zinc-900 peer-focus-visible:ring-zinc-500 dark:ring-offset-zinc-900 dark:peer-checked:ring-zinc-100"
                  :class="`accent-swatch-${accent}`"
                />
              </label>
            </div>
          </fieldset>

          <div class="space-y-1.5">
            <label for="wizard-theme" :class="fieldLabel">{{ t('settings.defaultTheme') }}</label>
            <select
              id="wizard-theme"
              v-model="firstRun.draft.defaultTheme"
              :class="textField"
              data-testid="wizard-theme"
            >
              <option v-for="mode in THEME_MODES" :key="mode" :value="mode">
                {{ t(`settings.theme.${mode}`) }}
              </option>
            </select>
          </div>
        </div>

        <AppearancePreview
          :app-name="firstRun.draft.appName"
          :accent="firstRun.draft.accent"
          :theme="firstRun.draft.defaultTheme"
          :logo="firstRun.logo?.dataUrl ?? null"
        />
      </div>
    </template>

    <div class="mt-8 flex items-center justify-between gap-3">
      <button
        v-if="step === 2"
        type="button"
        :class="secondaryButton"
        data-testid="wizard-back"
        @click="step = 1"
      >
        {{ t('wizard.back') }}
      </button>
      <span v-else />
      <button
        v-if="step === 1"
        type="button"
        :disabled="!nameIsValid"
        :class="primaryButton"
        data-testid="wizard-next"
        @click="step = 2"
      >
        {{ t('wizard.next') }}
      </button>
      <button
        v-else
        type="button"
        :class="primaryButton"
        data-testid="wizard-finish"
        @click="firstRun.finish()"
      >
        {{ t('wizard.finish') }}
      </button>
    </div>

    <button
      type="button"
      class="mt-4 w-full text-center text-xs text-zinc-500 hover:underline dark:text-zinc-400"
      data-testid="wizard-skip"
      @click="firstRun.skip()"
    >
      {{ t('wizard.skip') }}
    </button>
  </div>
</template>
