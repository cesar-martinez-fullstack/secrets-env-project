<script setup lang="ts">
import { useI18n } from '@/i18n/use-i18n';
import { useSettingsStore } from '@/stores/settings';
import AppIcon from '@/components/AppIcon.vue';
import type { IconName } from '@/components/icons';

withDefaults(defineProps<{ icon?: IconName; large?: boolean }>(), { icon: 'lock' });

const settings = useSettingsStore();
const { t } = useI18n();
</script>

<template>
  <img
    v-if="settings.logoUrl"
    :src="settings.logoUrl"
    :alt="t('settings.logoAlt')"
    data-testid="brand-logo"
    class="object-contain"
    :class="large ? 'h-14 w-14 rounded-2xl' : 'h-9 w-9 rounded-xl'"
  />
  <span
    v-else
    class="flex items-center justify-center bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
    :class="large ? 'h-14 w-14 rounded-2xl shadow-lg' : 'h-9 w-9 rounded-xl'"
  >
    <AppIcon :name="icon" :size="large ? 26 : 18" />
  </span>
</template>
