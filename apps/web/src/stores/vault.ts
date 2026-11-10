/**
 * Store de la bóveda: estado de desbloqueo, setup, unlock, lock y cambio de contraseña.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { VaultStatusDto } from '@secretvault/shared';
import { api } from '@/lib/api';

export const useVaultStore = defineStore('vault', () => {
  const status = ref<VaultStatusDto | null>(null);
  /**
   * Clave de recuperación recién emitida, pendiente de que la persona confirme haberla
   * guardado. Vive solo en memoria del navegador y se descarta al confirmar.
   */
  const pendingRecoveryKey = ref<string | null>(null);

  const initialized = computed(() => status.value?.initialized ?? false);
  const unlocked = computed(() => status.value?.unlocked ?? false);
  const autoLockMinutes = computed(() => status.value?.autoLockMinutes ?? 15);
  const recoveryAvailable = computed(() => status.value?.recoveryAvailable ?? false);

  async function refreshStatus(): Promise<VaultStatusDto | null> {
    status.value = await api.getVaultStatus();
    return status.value;
  }

  async function setup(masterPassword: string): Promise<void> {
    const result = await api.setupVault(masterPassword);
    pendingRecoveryKey.value = result.recoveryKey;
    await refreshStatus();
  }

  async function unlock(masterPassword: string): Promise<void> {
    const result = await api.unlockVault(masterPassword);
    // Solo viene al actualizar una bóveda anterior: se muestra una vez.
    if (result.recoveryKey) pendingRecoveryKey.value = result.recoveryKey;
    await refreshStatus();
  }

  async function recover(recoveryKey: string, newPassword: string): Promise<void> {
    const result = await api.recoverVault(recoveryKey, newPassword);
    pendingRecoveryKey.value = result.recoveryKey; // la usada se reemplazó por esta
    await refreshStatus();
  }

  async function regenerateRecoveryKey(currentPassword: string): Promise<void> {
    const result = await api.regenerateRecoveryKey(currentPassword);
    pendingRecoveryKey.value = result.recoveryKey;
  }

  function acknowledgeRecoveryKey(): void {
    pendingRecoveryKey.value = null;
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
    recoveryAvailable,
    pendingRecoveryKey,
    refreshStatus,
    setup,
    unlock,
    recover,
    regenerateRecoveryKey,
    acknowledgeRecoveryKey,
    lock,
    changeMasterPassword,
  };
});
