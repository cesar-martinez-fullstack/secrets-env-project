import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { LOGO_MAX_BYTES, detectLogoType, encodeBase64 } from '@secretvault/shared';
import type { SettingsDto } from '@secretvault/shared';
import { api, ApiError } from '@/lib/api';

export const useSettingsStore = defineStore('settings', () => {
  const current = ref<SettingsDto>({ hasLogo: false, logoVersion: null });

  const logoUrl = computed(() =>
    current.value.hasLogo ? `/api/settings/logo?v=${current.value.logoVersion ?? 0}` : null,
  );

  async function load(): Promise<void> {
    try {
      current.value = await api.getSettings();
    } catch {
      current.value = { hasLogo: false, logoVersion: null };
    }
  }

  async function uploadLogo(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > LOGO_MAX_BYTES || detectLogoType(bytes) === null) {
      throw new ApiError('LOGO_INVALID', 'Imagen no válida.', 400);
    }
    current.value = await api.setLogo(encodeBase64(bytes));
  }

  async function removeLogo(): Promise<void> {
    current.value = await api.removeLogo();
  }

  return { current, logoUrl, load, uploadLogo, removeLogo };
});
