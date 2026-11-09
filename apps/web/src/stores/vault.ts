/**
 * Store de la bóveda: estado de desbloqueo, setup, unlock, lock y cambio de contraseña.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { VaultStatusDto } from '@secretvault/shared';
import { api } from '@/lib/api';

export const useVaultStore = defineStore('vault', () => {
  const status = ref<VaultStatusDto | null>(null);

  const initialized = computed(() => status.value?.initialized ?? false);
  const unlocked = computed(() => status.value?.unlocked ?? false);
  const autoLockMinutes = computed(() => status.value?.autoLockMinutes ?? 15);

  async function refreshStatus(): Promise<VaultStatusDto | null> {
    status.value = await api.getVaultStatus();
    return status.value;
  }

  async function setup(masterPassword: string): Promise<void> {
    await api.setupVault(masterPassword);
    await refreshStatus();
  }

  async function unlock(masterPassword: string): Promise<void> {
    await api.unlockVault(masterPassword);
    await refreshStatus();
  }

  async function lock(): Promise<void> {
    await api.lockVault();
    if (status.value) status.value = { ...status.value, unlocked: false };
  }

  async function changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.changeMasterPassword(currentPassword, newPassword);
  }

  return {
    status,
    initialized,
    unlocked,
    autoLockMinutes,
    refreshStatus,
    setup,
    unlock,
    lock,
    changeMasterPassword,
  };
});
