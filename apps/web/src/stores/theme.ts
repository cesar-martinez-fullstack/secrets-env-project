/**
 * Store de tema. La elección de la persona (guardada en el navegador) manda; sin ella se usa el
 * tema por defecto de la instancia, y "system" sigue al sistema operativo.
 */
import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';
import { isThemeMode } from '@secretvault/shared';
import type { ThemeMode } from '@secretvault/shared';
import { useSettingsStore } from '@/stores/settings';

export type { ThemeMode };

const STORAGE_KEY = 'sv-theme';

function readStoredMode(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isThemeMode(stored) ? stored : null;
}

function detectSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useThemeStore = defineStore('theme', () => {
  const settings = useSettingsStore();
  const chosen = ref<ThemeMode | null>(readStoredMode());
  const systemDark = ref(detectSystemDark());

  const mode = computed<ThemeMode>(() => chosen.value ?? settings.current.defaultTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    systemDark.value = event.matches;
  });

  const isDark = computed(() =>
    mode.value === 'system' ? systemDark.value : mode.value === 'dark',
  );

  watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value);
  });

  function setMode(next: ThemeMode): void {
    chosen.value = next;
    localStorage.setItem(STORAGE_KEY, next);
  }

  function toggle(): void {
    setMode(isDark.value ? 'light' : 'dark');
  }

  return { mode, isDark, systemDark, setMode, toggle };
});
