/**
 * Router del SPA con guardia de sesión: sin bóveda desbloqueada → pantalla de
 * setup/unlock. El estado se refresca en cada navegación.
 */
import { createRouter, createWebHistory } from 'vue-router';
import { useVaultStore } from '@/stores/vault';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'unlock',
      component: () => import('@/views/UnlockView.vue'),
    },
    {
      path: '/vault',
      name: 'vault',
      component: () => import('@/views/VaultView.vue'),
    },
    {
      path: '/audit',
      name: 'audit',
      component: () => import('@/views/AuditView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const vault = useVaultStore();
  try {
    await vault.refreshStatus();
  } catch {
    // Sin conexión: dejar pasar solo a la pantalla de unlock.
    if (to.name !== 'unlock') return { name: 'unlock' };
    return true;
  }

  const needsUnlock = to.name === 'vault' || to.name === 'audit';
  if (needsUnlock && !vault.unlocked) return { name: 'unlock' };
  if (to.name === 'unlock' && vault.unlocked) return { name: 'vault' };
  return true;
});

export default router;
