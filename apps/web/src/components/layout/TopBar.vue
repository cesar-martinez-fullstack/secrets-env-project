<script setup lang="ts">
/**
 * Barra superior: marca, buscador global en tiempo real, acciones de tema,
 * auditoría, bloqueo y creación de secretos.
 */
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import { useI18n } from '@/i18n/use-i18n';
import { useDataStore } from '@/stores/data';
import { useThemeStore } from '@/stores/theme';

const emit = defineEmits<{
  'create-secret': [];
  security: [];
  settings: [];
  lock: [];
}>();

const data = useDataStore();
const theme = useThemeStore();
const { t, localeStore } = useI18n();

const nextLocale = computed(() => (localeStore.locale === 'es' ? 'en' : 'es'));
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80"
  >
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
      <!-- Marca -->
      <RouterLink to="/vault" class="flex items-center gap-2.5" title="SecretVault">
        <BrandMark />
        <span
          class="hidden text-[15px] font-semibold tracking-tight text-zinc-900 sm:block dark:text-zinc-100"
        >
          SecretVault
        </span>
      </RouterLink>

      <!-- Buscador global -->
      <div class="relative mx-auto w-full max-w-md">
        <AppIcon
          name="search"
          :size="16"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          v-model="data.query"
          type="search"
          :placeholder="t('topbar.searchPlaceholder')"
          autocomplete="off"
          spellcheck="false"
          class="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-9 text-sm text-zinc-800 placeholder-zinc-400 transition-colors focus:border-indigo-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:bg-zinc-900"
        />
        <button
          v-if="data.query"
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          :aria-label="t('topbar.clearSearch')"
          @click="data.query = ''"
        >
          <AppIcon name="x" :size="14" />
        </button>
      </div>

      <!-- Acciones -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="theme.isDark ? t('common.themeToLight') : t('common.themeToDark')"
          :aria-label="t('common.theme')"
          @click="theme.toggle()"
        >
          <AppIcon :name="theme.isDark ? 'sun' : 'moon'" />
        </button>

        <button
          type="button"
          class="rounded-lg px-2 py-2 text-xs font-semibold uppercase text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="t('common.language')"
          :aria-label="t('common.language')"
          data-testid="language-toggle"
          @click="localeStore.setLocale(nextLocale)"
        >
          {{ nextLocale }}
        </button>

        <RouterLink
          to="/audit"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="t('topbar.audit')"
        >
          <AppIcon name="history" />
        </RouterLink>

        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="t('topbar.settings')"
          :aria-label="t('topbar.settings')"
          data-testid="open-settings"
          @click="emit('settings')"
        >
          <AppIcon name="settings" />
        </button>

        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="t('topbar.securityTitle')"
          :aria-label="t('topbar.security')"
          @click="emit('security')"
        >
          <AppIcon name="shield" />
        </button>

        <button
          type="button"
          class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          :title="t('topbar.lock')"
          @click="emit('lock')"
        >
          <AppIcon name="log-out" />
        </button>

        <button
          type="button"
          class="ml-1 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.98]"
          @click="emit('create-secret')"
        >
          <AppIcon name="plus" :size="16" />
          <span class="hidden sm:inline">{{ t('topbar.newSecret') }}</span>
        </button>
      </div>
    </div>
  </header>
</template>
