/**
 * Cliente HTTP tipado hacia el backend Hono. Lanza ApiError con el código de
 * error del protocolo; emite `sv:locked` cuando la bóveda se bloquea.
 */
import type {
  ApiErrorBody,
  AuditQueryResultDto,
  CreateEnvironmentRequestDto,
  CreateProjectRequestDto,
  RenameEnvironmentRequestDto,
  RenameProjectRequestDto,
  CreateSecretRequestDto,
  EnvironmentDto,
  ProjectDto,
  ImportSecretsRequestDto,
  ImportSecretsResultDto,
  OkDto,
  RecoverVaultResponseDto,
  RecoveryKeyDto,
  ShareExportRequestDto,
  ShareFileDto,
  ShareImportRequestDto,
  ShareImportResultDto,
  SharePreviewDto,
  SharePreviewRequestDto,
  RevealSecretDto,
  SecretDto,
  UpdateSecretRequestDto,
  SetLogoRequestDto,
  SettingsDto,
  SetupVaultResponseDto,
  UnlockVaultResponseDto,
  ValidationIssue,
  VaultStatusDto,
} from '@secretvault/shared';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const LOCKED_EVENT = 'sv:locked';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'No hay conexión con el servidor.', 0);
  }

  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    const code = errorBody?.error?.code ?? 'INTERNAL_ERROR';
    const message = errorBody?.error?.message ?? `Error HTTP ${response.status}`;
    if (code === 'VAULT_LOCKED') {
      window.dispatchEvent(new Event(LOCKED_EVENT));
    }
    throw new ApiError(code, message, response.status, errorBody?.error?.issues);
  }

  return body as T;
}

export const api = {
  // ── Bóveda ────────────────────────────────────────────────────────────
  getVaultStatus: () => request<VaultStatusDto>('/api/vault/status'),

  setupVault: (masterPassword: string) =>
    request<SetupVaultResponseDto>('/api/vault/setup', {
      method: 'POST',
      body: JSON.stringify({ masterPassword }),
    }),

  unlockVault: (masterPassword: string) =>
    request<UnlockVaultResponseDto>('/api/vault/unlock', {
      method: 'POST',
      body: JSON.stringify({ masterPassword }),
    }),

  recoverVault: (recoveryKey: string, newPassword: string) =>
    request<RecoverVaultResponseDto>('/api/vault/recover', {
      method: 'POST',
      body: JSON.stringify({ recoveryKey, newPassword }),
    }),

  regenerateRecoveryKey: (currentPassword: string) =>
    request<RecoveryKeyDto>('/api/vault/recovery-key', {
      method: 'POST',
      body: JSON.stringify({ currentPassword }),
    }),

  lockVault: () => request<OkDto>('/api/vault/lock', { method: 'POST' }),

  changeMasterPassword: (currentPassword: string, newPassword: string) =>
    request<OkDto>('/api/vault/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // ── Proyectos ─────────────────────────────────────────────────────────
  listProjects: () => request<ProjectDto[]>('/api/projects'),

  createProject: (name: string) =>
    request<ProjectDto>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name } satisfies CreateProjectRequestDto),
    }),

  renameProject: (id: number, name: string) =>
    request<ProjectDto>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name } satisfies RenameProjectRequestDto),
    }),

  deleteProject: (id: number) => request<OkDto>(`/api/projects/${id}`, { method: 'DELETE' }),

  // ── Ambientes ─────────────────────────────────────────────────────────
  listEnvironments: () => request<EnvironmentDto[]>('/api/environments'),

  createEnvironment: (projectId: number, name: string) =>
    request<EnvironmentDto>('/api/environments', {
      method: 'POST',
      body: JSON.stringify({ projectId, name } satisfies CreateEnvironmentRequestDto),
    }),

  renameEnvironment: (id: number, name: string) =>
    request<EnvironmentDto>(`/api/environments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name } satisfies RenameEnvironmentRequestDto),
    }),

  deleteEnvironment: (id: number) =>
    request<OkDto & { deletedSecrets: number }>(`/api/environments/${id}`, { method: 'DELETE' }),

  // ── Secretos ──────────────────────────────────────────────────────────
  listSecrets: (params: { environmentId?: number; q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.environmentId !== undefined)
      search.set('environmentId', String(params.environmentId));
    if (params.q) search.set('q', params.q);
    const qs = search.toString();
    return request<SecretDto[]>(`/api/secrets${qs ? `?${qs}` : ''}`);
  },

  createSecret: (payload: CreateSecretRequestDto) =>
    request<SecretDto>('/api/secrets', { method: 'POST', body: JSON.stringify(payload) }),

  updateSecret: (id: number, patch: UpdateSecretRequestDto) =>
    request<SecretDto>(`/api/secrets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteSecret: (id: number) => request<OkDto>(`/api/secrets/${id}`, { method: 'DELETE' }),

  revealSecret: (id: number) =>
    request<RevealSecretDto>(`/api/secrets/${id}/reveal`, { method: 'POST' }),

  importSecrets: (payload: ImportSecretsRequestDto) =>
    request<ImportSecretsResultDto>('/api/secrets/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ── Ajustes ───────────────────────────────────────────────────────────
  getSettings: () => request<SettingsDto>('/api/settings'),

  setLogo: (data: string) =>
    request<SettingsDto>('/api/settings/logo', {
      method: 'PUT',
      body: JSON.stringify({ data } satisfies SetLogoRequestDto),
    }),

  removeLogo: () => request<SettingsDto>('/api/settings/logo', { method: 'DELETE' }),

  // ── Compartir ─────────────────────────────────────────────────────────
  exportShare: (target: 'projects' | 'environments', id: number, passphrase: string) =>
    request<ShareFileDto>(`/api/share/${target}/${id}/export`, {
      method: 'POST',
      body: JSON.stringify({ passphrase } satisfies ShareExportRequestDto),
    }),

  previewShare: (payload: SharePreviewRequestDto) =>
    request<SharePreviewDto>('/api/share/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importShare: (payload: ShareImportRequestDto) =>
    request<ShareImportResultDto>('/api/share/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ── Auditoría ─────────────────────────────────────────────────────────
  listAudit: (limit = 100, offset = 0) =>
    request<AuditQueryResultDto>(`/api/audit?limit=${limit}&offset=${offset}`),
};

export const LISTEN_LOCKED = LOCKED_EVENT;
