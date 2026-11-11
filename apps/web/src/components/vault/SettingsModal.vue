<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '@/i18n/use-i18n';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import BaseModal from '@/components/ui/BaseModal.vue';
import BrandMark from '@/components/ui/BrandMark.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const settings = useSettingsStore();
const toast = useToastStore();
const { t, describeError } = useI18n();

const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);

async function run(work: () => Promise<void>, success: string): Promise<void> {
  busy.value = true;
  try {
    await work();
    toast.push('success', success);
  } catch (error) {
    toast.push('error', t('settings.logoFailed'), describeError(error));
  } finally {
    busy.value = false;
  }
}

async function onFile(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (file) await run(() => settings.uploadLogo(file), t('settings.logoSaved'));
}

const secondaryButton =
  'rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';
</script>

<template>
  <BaseModal :open="open" :title="t('settings.title')" max-width="md" @close="emit('close')">
    <section class="space-y-3" data-testid="settings-logo">
      <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {{ t('settings.logo') }}
      </h3>
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
            @click="run(() => settings.removeLogo(), t('settings.logoRemoved'))"
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
  </BaseModal>
</template>
