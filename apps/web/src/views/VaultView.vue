<script setup lang="ts">
/**
 * Vista principal: barra superior, sidebar de ambientes y tabla de secretos
 * con todos los modales (CRUD, importar, exportar, confirmaciones).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { EnvironmentDto, SecretDto } from '@secretvault/shared';
import { useDataStore } from '@/stores/data';
import { useVaultStore } from '@/stores/vault';
import { useToastStore } from '@/stores/toast';
import TopBar from '@/components/layout/TopBar.vue';
import EnvironmentSidebar from '@/components/layout/EnvironmentSidebar.vue';
import SecretsTable from '@/components/vault/SecretsTable.vue';
import SecretFormModal from '@/components/vault/SecretFormModal.vue';
import ImportModal from '@/components/vault/ImportModal.vue';
import ExportMenu from '@/components/vault/ExportMenu.vue';
import EnvironmentFormModal from '@/components/vault/EnvironmentFormModal.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import AppIcon from '@/components/AppIcon.vue';

const router = useRouter();
const data = useDataStore();
const vault = useVaultStore();
const toast = useToastStore();

// ── Estado de modales ──────────────────────────────────────────────────
const secretModalOpen = ref(false);
const secretModalEditing = ref<SecretDto | null>(null);

const envModalOpen = ref(false);
const envModalEditing = ref<EnvironmentDto | null>(null);

const importOpen = ref(false);

const confirmState = ref<{
  open: boolean;
  title: string;
  message: string;
  danger: boolean;
  confirmText: string;
  action: (() => Promise<void>) | null;
}>({
  open: false,
  title: '',
  message: '',
  danger: true,
  confirmText: 'Eliminar',
  action: null,
});

// ── Auto-lock informativo en la UI ─────────────────────────────────────
const minutesLeft = ref(0);
let lockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  data.init();
  // Recordatorio visual del auto-lock (el backend es la fuente de verdad).
  lockTimer = setInterval(() => {
    void vault.refreshStatus().then((status) => {
      if (status && !status.unlocked) {
        void router.replace('/');
      }
    });
  }, 60_000);
});

onBeforeUnmount(() => {
  if (lockTimer) clearInterval(lockTimer);
});

async function handleLock(): Promise<void> {
  await vault.lock();
  toast.push('info', 'Bóveda bloqueada', 'La clave fue borrada de la memoria.');
  await router.replace('/');
}

function openCreateSecret(): void {
  secretModalEditing.value = null;
  secretModalOpen.value = true;
}

function openEditSecret(secret: SecretDto): void {
  secretModalEditing.value = secret;
  secretModalOpen.value = true;
}

function openCreateEnv(): void {
  envModalEditing.value = null;
  envModalOpen.value = true;
}

function openRenameEnv(env: EnvironmentDto): void {
  envModalEditing.value = env;
  envModalOpen.value = true;
}

function askDeleteEnv(env: EnvironmentDto): void {
  confirmState.value = {
    open: true,
    title: 'Eliminar ambiente',
    message: `Se eliminará el ambiente «${env.name}» junto con sus ${env.secretCount} secreto(s) cifrado(s). Esta acción no se puede deshacer.`,
    danger: true,
    confirmText: `Eliminar ${env.name}`,
    action: async () => {
      await data.deleteEnvironment(env.id);
      toast.push('success', 'Ambiente eliminado', `«${env.name}» y sus secretos fueron borrados.`);
    },
  };
}

function askDeleteSecret(secret: SecretDto): void {
  confirmState.value = {
    open: true,
    title: 'Eliminar secreto',
    message: `¿Eliminar el secreto «${secret.name}» del ambiente «${secret.environmentName}»? Esta acción no se puede deshacer.`,
    danger: true,
    confirmText: 'Eliminar',
    action: async () => {
      await data.removeSecret(secret.id);
      toast.push('success', 'Secreto eliminado', `«${secret.name}» fue borrado.`);
    },
  };
}

async function runConfirm(): Promise<void> {
  try {
    await confirmState.value.action?.();
  } catch (error) {
    toast.push('error', 'Error', error instanceof Error ? error.message : undefined);
  } finally {
    confirmState.value = { ...confirmState.value, open: false };
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <TopBar @create-secret="openCreateSecret" @lock="handleLock" />

    <div class="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
      <EnvironmentSidebar
        @create-env="openCreateEnv"
        @rename-env="openRenameEnv"
        @delete-env="askDeleteEnv"
      />

      <!-- Contenido principal -->
      <main class="min-w-0 flex-1">
        <!-- Toolbar del ambiente / búsqueda -->
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
          <div class="min-w-0">
            <template v-if="data.isSearching">
              <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Resultados para
                <span class="font-mono text-indigo-600 dark:text-indigo-400"
                  >«{{ data.query.trim() }}»</span
                >
              </h1>
              <p class="text-xs text-zinc-400">Buscando entre todos los ambientes</p>
            </template>
            <template v-else-if="data.activeEnv">
              <h1
                class="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
              >
                {{ data.activeEnv.name }}
              </h1>
              <p class="text-xs text-zinc-400">
                {{ data.activeEnv.secretCount }} secreto(s) · cifrado AES-256-GCM
              </p>
            </template>
            <template v-else>
              <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Bóveda
              </h1>
            </template>
          </div>

          <div v-if="!data.isSearching" class="flex items-center gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              :disabled="data.activeEnvId === null"
              @click="importOpen = true"
            >
              <AppIcon name="upload" :size="15" />
              Importar
            </button>
            <ExportMenu />
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.98]"
              @click="openCreateSecret"
            >
              <AppIcon name="plus" :size="15" />
              Nuevo
            </button>
          </div>
        </div>

        <!-- Lista de secretos -->
        <div class="card mx-4 mb-10 sm:mx-6">
          <div
            v-if="data.isSearching && data.secrets.length > 0"
            class="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800"
          >
            {{ data.secrets.length }} resultado(s) en múltiples ambientes
          </div>
          <SecretsTable
            :secrets="data.secrets"
            :loading="data.loadingSecrets"
            @edit="openEditSecret"
            @remove="askDeleteSecret"
            @create-first="openCreateSecret"
          />
        </div>

        <!-- Sin ambientes -->
        <div
          v-if="data.environments.length === 0 && !data.loadingEnvs"
          class="card mx-4 mb-10 sm:mx-6"
        >
          <EmptyState
            icon="folder"
            title="Crea tu primer ambiente"
            description="Los ambientes (Local, QA, Production…) agrupan tus variables de entorno."
          >
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700"
              @click="openCreateEnv"
            >
              <AppIcon name="plus" :size="16" />
              Crear ambiente
            </button>
          </EmptyState>
        </div>
      </main>
    </div>

    <!-- Modales -->
    <SecretFormModal
      :open="secretModalOpen"
      :editing="secretModalEditing"
      @close="secretModalOpen = false"
    />
    <ImportModal :open="importOpen" @close="importOpen = false" />
    <EnvironmentFormModal
      :open="envModalOpen"
      :editing="envModalEditing"
      @close="envModalOpen = false"
    />

    <ConfirmDialog
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      :danger="confirmState.danger"
      :confirm-text="confirmState.confirmText"
      @confirm="runConfirm"
      @cancel="confirmState.open = false"
    />
  </div>
</template>
