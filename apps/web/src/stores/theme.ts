/**
 * Store de tema. Sin preferencia guardada sigue al sistema operativo; al alternar se guarda la elección.
 */
import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'sv-theme';

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function detectSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readStoredMode());
  const systemDark = ref(detectSystemDark());

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
    mode.value = next;
    localStorage.setItem(STORAGE_KEY, next);
  }

  function toggle(): void {
    setMode(isDark.value ? 'light' : 'dark');
  }

  return { mode, isDark, setMode, toggle };
});
