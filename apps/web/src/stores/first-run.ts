/**
 * Elecciones del asistente de primer arranque. Se guardan solo en memoria: la bóveda aún no existe
 * y escribir los ajustes exige una sesión abierta, así que se aplican justo después de crearla.
 */
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import { DEFAULT_APPEARANCE, encodeBase64 } from '@secretvault/shared';
import type { Appearance } from '@secretvault/shared';
import { hasAppearanceChanges } from '@/lib/first-run';
import { readLogoFile } from '@/lib/logo-file';
import { useSettingsStore } from '@/stores/settings';

interface PendingLogo {
  bytes: Uint8Array;
  dataUrl: string;
}

export const useFirstRunStore = defineStore('firstRun', () => {
  const settings = useSettingsStore();
  const finished = ref(false);
  const draft = reactive<Appearance>({ ...DEFAULT_APPEARANCE });
  const logo = ref<PendingLogo | null>(null);

  async function chooseLogo(file: File): Promise<void> {
    const { bytes, mimeType } = await readLogoFile(file);
    logo.value = { bytes, dataUrl: `data:${mimeType};base64,${encodeBase64(bytes)}` };
  }

  function clearLogo(): void {
    logo.value = null;
  }

  function finish(): void {
    finished.value = true;
  }

  function skip(): void {
    Object.assign(draft, DEFAULT_APPEARANCE);
    logo.value = null;
    finished.value = true;
  }

  /** Corre con la bóveda ya creada y desbloqueada. Si algo falla, queda en Ajustes para reintentar. */
  async function apply(): Promise<void> {
    if (hasAppearanceChanges(draft)) await settings.updateAppearance({ ...draft });
    if (logo.value) await settings.setLogoBytes(logo.value.bytes);
  }

  return { finished, draft, logo, chooseLogo, clearLogo, finish, skip, apply };
});
