/**
 * Store de tema: claro / oscuro / según sistema operativo.
 * Persistido en localStorage; evita el flash gracias al script inline del index.html.
 */
import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';

function detectSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>((localStorage.getItem('sv-theme') as ThemeMode) ?? 'system');
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
    localStorage.setItem('sv-theme', next);
  }

  /** Cicla: system → light → dark → system */
  function cycle(): void {
    setMode(mode.value === 'system' ? 'light' : mode.value === 'light' ? 'dark' : 'system');
  }

  return { mode, isDark, setMode, cycle };
});
