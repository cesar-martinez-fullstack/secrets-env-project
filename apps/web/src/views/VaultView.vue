<script setup lang="ts">
/**
 * Vista principal: barra superior, sidebar de ambientes y tabla de secretos
 * con todos los modales (CRUD, importar, exportar, confirmaciones).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { EnvironmentDto, ProjectDto, SecretDto } from '@secretvault/shared';
import { useDataStore } from '@/stores/data';
import { useVaultStore } from '@/stores/vault';
import { useToastStore } from '@/stores/toast';
import { useI18n } from '@/i18n/use-i18n';
import TopBar from '@/components/layout/TopBar.vue';
import ProjectSidebar from '@/components/layout/ProjectSidebar.vue';
import SecretsTable from '@/components/vault/SecretsTable.vue';
import SecretFormModal from '@/components/vault/SecretFormModal.vue';
import ImportModal from '@/components/vault/ImportModal.vue';
import ShareExportModal from '@/components/vault/ShareExportModal.vue';
import ShareImportModal from '@/components/vault/ShareImportModal.vue';
import type { ShareTarget } from '@/components/vault/share-target';
import ExportMenu from '@/components/vault/ExportMenu.vue';
import EnvironmentFormModal from '@/components/vault/EnvironmentFormModal.vue';
import ProjectFormModal from '@/components/vault/ProjectFormModal.vue';
import SecurityModal from '@/components/vault/SecurityModal.vue';
import SettingsModal from '@/components/vault/SettingsModal.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import AppIcon from '@/components/AppIcon.vue';

const router = useRouter();
const data = useDataStore();
const vault = useVaultStore();
const toast = useToastStore();
const { t, describeError } = useI18n();

// ── Estado de modales ──────────────────────────────────────────────────
const secretModalOpen = ref(false);
const secretModalEditing = ref<SecretDto | null>(null);

const envModalOpen = ref(false);
const envModalEditing = ref<EnvironmentDto | null>(null);
const envModalProjectId = ref<number | null>(null);

const projectModalOpen = ref(false);
const projectModalEditing = ref<ProjectDto | null>(null);

const importOpen = ref(false);
const shareTarget = ref<ShareTarget | null>(null);
const shareImportOpen = ref(false);
const securityOpen = ref(false);
const settingsOpen = ref(false);

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
  confirmText: '',
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
  toast.push('info', t('vault.lockedTitle'), t('vault.lockedBody'));
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

function openCreateProject(): void {
  projectModalEditing.value = null;
  projectModalOpen.value = true;
}

function openRenameProject(project: ProjectDto): void {
  projectModalEditing.value = project;
  projectModalOpen.value = true;
}

function askDeleteProject(project: ProjectDto): void {
  if (project.environmentCount > 0) {
    toast.push(
      'info',
      t('vault.projectHasEnvsTitle'),
      t('vault.projectHasEnvsBody', { count: project.environmentCount, name: project.name }),
    );
    return;
  }
  confirmState.value = {
    open: true,
    title: t('vault.deleteProjectTitle'),
    message: t('vault.deleteProjectMessage', { name: project.name }),
    danger: true,
    confirmText: t('vault.deleteProjectConfirm', { name: project.name }),
    action: async () => {
      await data.deleteProject(project.id);
      toast.push(
        'success',
        t('vault.projectDeleted'),
        t('vault.projectDeletedBody', { name: project.name }),
      );
    },
  };
}

function openCreateEnv(project: ProjectDto): void {
  envModalEditing.value = null;
  envModalProjectId.value = project.id;
  envModalOpen.value = true;
}

function openCreateFirstEnv(): void {
  const first = data.projects[0];
  if (first) openCreateEnv(first);
}

function openRenameEnv(env: EnvironmentDto): void {
  envModalEditing.value = env;
  envModalProjectId.value = env.projectId;
  envModalOpen.value = true;
}

function askDeleteEnv(env: EnvironmentDto): void {
  confirmState.value = {
    open: true,
    title: t('vault.deleteEnvTitle'),
    message: t('vault.deleteEnvMessage', { name: env.name, count: env.secretCount }),
    danger: true,
    confirmText: t('vault.deleteProjectConfirm', { name: env.name }),
    action: async () => {
      await data.deleteEnvironment(env.id);
      toast.push('success', t('vault.envDeleted'), t('vault.envDeletedBody', { name: env.name }));
    },
  };
}

function askDeleteSecret(secret: SecretDto): void {
  confirmState.value = {
    open: true,
    title: t('vault.deleteSecretTitle'),
    message: t('vault.deleteSecretMessage', { name: secret.name, env: secret.environmentName }),
    danger: true,
    confirmText: t('vault.delete'),
    action: async () => {
      await data.removeSecret(secret.id);
      toast.push(
        'success',
        t('vault.secretDeleted'),
        t('vault.secretDeletedBody', { name: secret.name }),
      );
    },
  };
}

async function runConfirm(): Promise<void> {
  try {
    await confirmState.value.action?.();
  } catch (error) {
    toast.push('error', t('vault.error'), describeError(error));
  } finally {
    confirmState.value = { ...confirmState.value, open: false };
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <TopBar
      @create-secret="openCreateSecret"
      @security="securityOpen = true"
      @settings="settingsOpen = true"
      @lock="handleLock"
    />

    <div class="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
      <ProjectSidebar
        @create-project="openCreateProject"
        @rename-project="openRenameProject"
        @delete-project="askDeleteProject"
        @create-env="openCreateEnv"
        @rename-env="openRenameEnv"
        @delete-env="askDeleteEnv"
        @share-project="
          (project) => (shareTarget = { kind: 'projects', id: project.id, name: project.name })
        "
        @share-env="(env) => (shareTarget = { kind: 'environments', id: env.id, name: env.name })"
        @import-share="shareImportOpen = true"
      />

      <!-- Contenido principal -->
      <main class="min-w-0 flex-1">
        <!-- Toolbar del ambiente / búsqueda -->
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-6">
          <div class="min-w-0">
            <template v-if="data.isSearching">
              <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {{ t('vault.resultsFor') }}
                <span class="font-mono text-indigo-600 dark:text-indigo-400"
                  >«{{ data.query.trim() }}»</span
                >
              </h1>
              <p class="text-xs text-zinc-400">{{ t('vault.searchingAll') }}</p>
            </template>
            <template v-else-if="data.activeEnv">
              <h1
                class="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
              >
                {{ data.activeEnv.name }}
              </h1>
              <p class="text-xs text-zinc-400">
                {{ t('vault.envSummary', { count: data.activeEnv.secretCount }) }}
              </p>
            </template>
            <template v-else>
              <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {{ t('vault.title') }}
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
              {{ t('vault.import') }}
            </button>
            <ExportMenu />
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-indigo-600/25 transition-all hover:bg-indigo-700 active:scale-[0.98]"
              @click="openCreateSecret"
            >
              <AppIcon name="plus" :size="15" />
              {{ t('vault.new') }}
            </button>
          </div>
        </div>

        <!-- Lista de secretos -->
        <div class="card mx-4 mb-10 sm:mx-6">
          <div
            v-if="data.isSearching && data.secrets.length > 0"
            class="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800"
          >
            {{ t('vault.searchCount', { count: data.secrets.length }) }}
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
            :title="t('vault.firstEnvTitle')"
            :description="t('vault.firstEnvDescription')"
          >
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700"
              @click="openCreateFirstEnv"
            >
              <AppIcon name="plus" :size="16" />
              {{ t('vault.createEnv') }}
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
    <ShareExportModal
      :open="shareTarget !== null"
      :target="shareTarget"
      @close="shareTarget = null"
    />
    <ShareImportModal :open="shareImportOpen" @close="shareImportOpen = false" />
    <SecurityModal :open="securityOpen" @close="securityOpen = false" />
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" />
    <ProjectFormModal
      :open="projectModalOpen"
      :editing="projectModalEditing"
      @close="projectModalOpen = false"
    />
    <EnvironmentFormModal
      :open="envModalOpen"
      :editing="envModalEditing"
      :project-id="envModalProjectId"
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
