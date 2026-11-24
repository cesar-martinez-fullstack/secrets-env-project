import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useVaultStore } from './stores/vault';
import { useToastStore } from './stores/toast';
import { useLocaleStore } from './stores/locale';
import { LISTEN_LOCKED } from './lib/api';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Si el backend bloquea la bóveda (manual o por inactividad), regresar a la pantalla
// de desbloqueo con una notificación.
const toast = useToastStore();
const locale = useLocaleStore();
window.addEventListener(LISTEN_LOCKED, () => {
  toast.push('info', locale.t('app.lockedTitle'), locale.t('app.lockedBody'));
  const vault = useVaultStore();
  if (vault.status) vault.status = { ...vault.status, unlocked: false };
  void router.replace('/');
});
