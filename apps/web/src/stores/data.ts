/**
 * Store de datos: proyectos, ambientes, secretos y búsqueda global en tiempo real.
 * Sin búsqueda → secretos del ambiente activo; con búsqueda → resultados en TODOS los ambientes.
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type {
  CreateSecretRequestDto,
  EnvironmentDto,
  ImportEntryDto,
  ImportSecretsResultDto,
  ShareImportRequestDto,
  ShareImportResultDto,
  ProjectDto,
  SecretDto,
} from '@secretvault/shared';
import { api, type ListSecretsParams } from '@/lib/api';
import { PAGE_SIZE, isPaged, lastPage } from '@/lib/pagination';
import { useSortStore } from '@/stores/sort';

export const useDataStore = defineStore('data', () => {
  const projects = ref<ProjectDto[]>([]);
  const environments = ref<EnvironmentDto[]>([]);
  const secrets = ref<SecretDto[]>([]);
  const activeEnvId = ref<number | null>(null);
  const query = ref('');
  const loadingEnvs = ref(false);
  const loadingSecrets = ref(false);
  const page = ref(0);
  const total = ref(0);
  const sort = useSortStore();

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

  const paged = computed(() => isPaged(sort.order, isSearching.value));

  function listParams(): ListSecretsParams {
    const scope: ListSecretsParams = isSearching.value
      ? { q: query.value.trim() } // búsqueda global entre todos los ambientes
      : { environmentId: activeEnvId.value ?? undefined };
    const order = sort.order === 'manual' && isSearching.value ? 'asc' : sort.order;
    if (!paged.value) return { ...scope, order };
    return { ...scope, order, limit: PAGE_SIZE, offset: page.value * PAGE_SIZE };
  }

  // Solo se aplica la respuesta de la petición más reciente: al paginar rápido pueden cruzarse.
  let latest = 0;

  async function refreshSecrets(): Promise<void> {
    const mine = ++latest;
    loadingSecrets.value = true;
    try {
      const result = await api.listSecrets(listParams());
      if (mine !== latest) return;
      total.value = result.total;
      if (paged.value && result.items.length === 0 && page.value > 0) {
        page.value = lastPage(result.total);
        await refreshSecrets();
        return;
      }
      secrets.value = result.items;
    } finally {
      if (mine === latest) loadingSecrets.value = false;
    }
  }

  async function goToPage(target: number): Promise<void> {
    const next = Math.min(Math.max(target, 0), lastPage(total.value));
    if (next === page.value) return;
    page.value = next;
    await refreshSecrets();
  }

  function showFirstPage(): void {
    page.value = 0;
  }

  function scheduleRefreshSecrets(delay = 220): void {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void refreshSecrets(), delay);
  }

  // Búsqueda con debounce para no golpear el API en cada tecla.
  watch(query, () => {
    showFirstPage();
    scheduleRefreshSecrets(220);
  });

  // Cambiar de ambiente o de orden vuelve a la primera página y refresca de inmediato.
  watch([activeEnvId, () => sort.order], () => {
    showFirstPage();
    void refreshSecrets();
  });

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

  async function moveEnvironment(id: number, projectId: number): Promise<void> {
    await api.moveEnvironment(id, projectId);
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

  async function removeSecrets(ids: number[]): Promise<number> {
    const { deleted } = await api.deleteSecrets(ids);
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
    return deleted;
  }

  async function reorderSecrets(environmentId: number, ids: number[]): Promise<void> {
    try {
      await api.reorderSecrets(environmentId, ids);
    } finally {
      await refreshSecrets();
    }
  }

  async function importSecrets(
    environmentId: number,
    entries: ImportEntryDto[],
    overwrite: boolean,
  ): Promise<ImportSecretsResultDto> {
    const result = await api.importSecrets({ environmentId, entries, overwrite });
    await Promise.all([refreshEnvironments(), refreshSecrets()]);
    return result;
  }

  /** Crea el ambiente e importa en él; si la importación falla, no deja un ambiente vacío. */
  async function importIntoNewEnvironment(
    projectId: number,
    name: string,
    entries: ImportEntryDto[],
  ): Promise<ImportSecretsResultDto> {
    const created = await api.createEnvironment(projectId, name);
    try {
      const result = await api.importSecrets({
        environmentId: created.id,
        entries,
        overwrite: false,
      });
      activeEnvId.value = created.id;
      return result;
    } catch (error) {
      await api.deleteEnvironment(created.id);
      throw error;
    } finally {
      await refreshEnvironments();
      await refreshSecrets();
    }
  }

  async function importShare(request: ShareImportRequestDto): Promise<ShareImportResultDto> {
    const result = await api.importShare(request);
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
    page,
    total,
    paged,
    goToPage,
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
    moveEnvironment,
    deleteEnvironment,
    addSecret,
    updateSecret,
    removeSecret,
    removeSecrets,
    reorderSecrets,
    importSecrets,
    importIntoNewEnvironment,
    importShare,
    init,
  };
});
