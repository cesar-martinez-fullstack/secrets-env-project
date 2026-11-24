import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';
import { DEFAULT_APPEARANCE, encodeBase64 } from '@secretvault/shared';
import type { Appearance, SettingsDto } from '@secretvault/shared';
import { api } from '@/lib/api';
import { readLogoFile } from '@/lib/logo-file';

const NO_LOGO: SettingsDto = { hasLogo: false, logoVersion: null, ...DEFAULT_APPEARANCE };

function applyBranding({ accent, appName }: Appearance): void {
  document.documentElement.dataset.accent = accent;
  document.title = appName;
}

export const useSettingsStore = defineStore('settings', () => {
  const current = ref<SettingsDto>(NO_LOGO);

  const logoUrl = computed(() =>
    current.value.hasLogo ? `/api/settings/logo?v=${current.value.logoVersion ?? 0}` : null,
  );

  watchEffect(() => applyBranding(current.value));

  async function load(): Promise<void> {
    try {
      current.value = await api.getSettings();
    } catch {
      current.value = NO_LOGO;
    }
  }

  async function updateAppearance(appearance: Appearance): Promise<void> {
    current.value = await api.updateAppearance(appearance);
  }

  async function setLogoBytes(bytes: Uint8Array): Promise<void> {
    current.value = await api.setLogo(encodeBase64(bytes));
  }

  async function uploadLogo(file: File): Promise<void> {
    await setLogoBytes((await readLogoFile(file)).bytes);
  }

  async function removeLogo(): Promise<void> {
    current.value = await api.removeLogo();
  }

  return { current, logoUrl, load, updateAppearance, setLogoBytes, uploadLogo, removeLogo };
});
