/**
 * Store de datos: proyectos, ambientes, secretos y búsqueda global en tiempo real.
 * Sin búsqueda → secretos del ambiente activo; con búsqueda → resultados en TODOS los ambientes.
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type {
  CreateSecretRequestDto,
  EnvironmentDto,
  ImportSecretsResultDto,
  ShareImportResultDto,
  ProjectDto,
  SecretDto,
} from '@secretvault/shared';
import { api } from '@/lib/api';

export const useDataStore = defineStore('data', () => {
  const projects = ref<ProjectDto[]>([]);
  const environments = ref<EnvironmentDto[]>([]);
  const secrets = ref<SecretDto[]>([]);
  const activeEnvId = ref<number | null>(null);
  const query = ref('');
  const loadingEnvs = ref(false);
  const loadingSecrets = ref(false);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const activeEnv = computed<EnvironmentDto | null>(
    () => environments.value.find((e) => e.id === activeEnvId.value) ?? null,
  );
  const environmentsOf = (projectId: number): EnvironmentDto[] =>
    environments.value.filter((env) => env.projectId === projectId);
  const isSearching = computed(() => query.value.trim().length > 0);
  const totalSecrets = computed(() =>
    environments.value.reduce((acc, env) => acc + env.secretCount, 0),
  );

  async function refreshEnvironments(): Promise<void> {
    loadingEnvs.value = true;
    try {
      [projects.value, environments.value] = await Promise.all([
        api.listProjects(),
        api.listEnvironments(),
      ]);
      if (
        activeEnvId.value === null ||
        !environments.value.some((e) => e.id === activeEnvId.value)
      ) {
        activeEnvId.value = environments.value[0]?.id ?? null;
      }
    } finally {
      loadingEnvs.value = false;
    }
  }

  async function refreshSecrets(): Promise<void> {
    loadingSecrets.value = true;
    try {
      const params: { environmentId?: number; q?: string } = {};
      if (isSearching.value) {
        params.q = query.value.trim(); // búsqueda global entre todos los ambientes
      } else if (activeEnvId.value !== null) {
        params.environmentId = activeEnvId.value;
      }
      secrets.value = await api.listSecrets(params);
    } finally {
      loadingSecrets.value = false;
    }
  }

  function scheduleRefreshSecrets(delay = 220): void {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void refreshSecrets(), delay);
  }

  // Búsqueda con debounce para no golpear el API en cada tecla.
  watch(query, () => scheduleRefreshSecrets(220));

  // Cambiar de ambiente refresca de inmediato.
  watch(activeEnvId, () => void refreshSecrets());

  async function addProject(name: string): Promise<void> {
    await api.createProject(name);
    await refreshEnvironments();
  }

  async function renameProject(id: number, name: string): Promise<void> {
    await api.renameProject(id, name);
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
  }

  async function deleteProject(id: number): Promise<void> {
    await api.deleteProject(id);
    await refreshEnvironments();
  }

  async function addEnvironment(projectId: number, name: string): Promise<void> {
    const created = await api.createEnvironment(projectId, name);
    await refreshEnvironments();
    activeEnvId.value = created.id;
  }

  async function renameEnvironment(id: number, name: string): Promise<void> {
    await api.renameEnvironment(id, name);
    await refreshEnvironments();
    await refreshSecrets();
  }

  async function deleteEnvironment(id: number): Promise<void> {
    await api.deleteEnvironment(id);
    if (activeEnvId.value === id) activeEnvId.value = null;
    await refreshEnvironments();
    await refreshSecrets();
  }

  async function addSecret(payload: CreateSecretRequestDto): Promise<void> {
    await api.createSecret(payload);
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
  }

  async function updateSecret(
    id: number,
    patch: { name?: string; value?: string; note?: string | null },
  ): Promise<void> {
    await api.updateSecret(id, patch);
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
  }

  async function removeSecret(id: number): Promise<void> {
    await api.deleteSecret(id);
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
  }

  async function importSecrets(
    environmentId: number,
    content: string,
    overwrite: boolean,
  ): Promise<ImportSecretsResultDto> {
    const result = await api.importSecrets({ environmentId, content, overwrite });
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
    return result;
  }

  async function importShare(content: string, passphrase: string): Promise<ShareImportResultDto> {
    const result = await api.importShare({ content, passphrase });
    await refreshEnvironments();
    activeEnvId.value = environmentsOf(result.projectId)[0]?.id ?? activeEnvId.value;
    await refreshSecrets();
    return result;
  }

  function init(): void {
    void refreshEnvironments().then(() => refreshSecrets());
  }

  return {
    projects,
    environments,
    secrets,
    activeEnvId,
    query,
    loadingEnvs,
    loadingSecrets,
    activeEnv,
    environmentsOf,
    isSearching,
    totalSecrets,
    refreshEnvironments,
    refreshSecrets,
    scheduleRefreshSecrets,
    addProject,
    renameProject,
    deleteProject,
    addEnvironment,
    renameEnvironment,
    deleteEnvironment,
    addSecret,
    updateSecret,
    removeSecret,
    importSecrets,
    importShare,
    init,
  };
});
