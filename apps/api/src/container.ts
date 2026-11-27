/**
 * Raíz de composición (composition root): conecta las implementaciones concretas
 * (crypto, database, session-store) con los puertos que exige `core`.
 * Único lugar del código donde se conocen todas las capas.
 */
import {
  AuditService,
  BackupService,
  EnvironmentService,
  LogLevelService,
  ProjectService,
  SecretService,
  SessionSecurityService,
  SettingsService,
  ShareService,
  UpdateService,
  VaultService,
  type ReleaseSource,
  type SessionStore,
} from '@secretvault/core';
import { NodeCryptoService } from '@secretvault/crypto';
import {
  closeDatabase,
  createRepositories,
  FileSettingsRepository,
  openDatabase,
  SqliteUnitOfWork,
  SqliteVaultBackup,
  type SqliteDatabase,
} from '@secretvault/database';
import { InMemorySessionStore } from './session-store';
import { RateLimiter } from './rate-limiter';
import { createLogger, type Logger } from './logging/logger';
import { GithubReleaseSource } from './update/github-release-source';
import { APP_VERSION } from './version';
import type { ApiConfig } from './config';

export interface Container {
  config: ApiConfig;
  db: SqliteDatabase;
  sessionStore: SessionStore;
  vaultService: VaultService;
  projectService: ProjectService;
  environmentService: EnvironmentService;
  secretService: SecretService;
  shareService: ShareService;
  settingsService: SettingsService;
  updateService: UpdateService;
  backupService: BackupService;
  sessionSecurityService: SessionSecurityService;
  logger: Logger;
  logLevelService: LogLevelService;
  auditService: AuditService;
  rateLimiters: {
    setup: RateLimiter;
    unlock: RateLimiter;
    changePassword: RateLimiter;
    recover: RateLimiter;
    share: RateLimiter;
    update: RateLimiter;
  };
}

export interface ContainerOverrides {
  releaseSource?: ReleaseSource;
  logWriter?: (line: string) => void;
}

export function createContainer(config: ApiConfig, overrides: ContainerOverrides = {}): Container {
  const { db } = openDatabase(config.dataDir);
  const repositories = createRepositories(db);
  const unitOfWork = new SqliteUnitOfWork(db);
  const crypto = new NodeCryptoService();
  const sessionStore = new InMemorySessionStore(crypto);

  // La confirmación de contraseña vive en VaultService, que a su vez necesita los límites.
  const sessionSecurityService: SessionSecurityService = new SessionSecurityService({
    security: repositories.securitySettings,
    sessions: sessionStore,
    passwords: {
      confirmPassword: (id: string, password: string): Promise<void> =>
        vaultService.confirmPassword(id, password),
    },
    audit: repositories.audit,
    unitOfWork,
    defaults: {
      autoLockMinutes: config.autoLockMinutes,
      sessionMaxMinutes: config.sessionMaxMinutes,
    },
  });

  const vaultService: VaultService = new VaultService({
    vaultRepo: repositories.vault,
    projects: repositories.projects,
    environments: repositories.environments,
    crypto,
    sessions: sessionStore,
    audit: repositories.audit,
    unitOfWork,
    config: { iterations: config.iterations },
    limits: sessionSecurityService,
  });

  const projectService = new ProjectService({
    projects: repositories.projects,
    audit: repositories.audit,
  });

  const environmentService = new EnvironmentService({
    projects: repositories.projects,
    environments: repositories.environments,
    secrets: repositories.secrets,
    audit: repositories.audit,
  });

  const secretService = new SecretService({
    secrets: repositories.secrets,
    environments: repositories.environments,
    crypto,
    audit: repositories.audit,
    unitOfWork,
  });

  const shareService = new ShareService({
    projects: repositories.projects,
    environments: repositories.environments,
    secrets: repositories.secrets,
    crypto,
    audit: repositories.audit,
    unitOfWork,
  });

  const settingsService = new SettingsService({
    settings: new FileSettingsRepository(config.dataDir),
    audit: repositories.audit,
  });

  const updateService = new UpdateService({
    source: overrides.releaseSource ?? new GithubReleaseSource(),
    audit: repositories.audit,
    currentVersion: APP_VERSION,
  });

  const backupService = new BackupService({
    passwords: vaultService,
    backup: new SqliteVaultBackup(db),
    audit: repositories.audit,
  });

  const auditService = new AuditService({
    audit: repositories.audit,
    security: repositories.securitySettings,
    passwords: vaultService,
    unitOfWork,
  });

  const logger = createLogger({
    level: config.logLevel,
    write: overrides.logWriter ?? ((line) => void process.stdout.write(`${line}\n`)),
  });
  const logLevelService = new LogLevelService({
    security: repositories.securitySettings,
    audit: repositories.audit,
    passwords: vaultService,
    unitOfWork,
    output: logger,
    defaultLevel: config.logLevel,
  });

  return {
    config,
    db,
    sessionStore,
    vaultService,
    projectService,
    environmentService,
    secretService,
    shareService,
    settingsService,
    updateService,
    backupService,
    auditService,
    sessionSecurityService,
    logger,
    logLevelService,
    rateLimiters: {
      // 20 setups / 10 min; 10 unlocks fallidos / 5 min; 10 cambios / 15 min; 10 recuperaciones / 15 min (por IP).
      setup: new RateLimiter(20, 10 * 60_000),
      unlock: new RateLimiter(10, 5 * 60_000),
      changePassword: new RateLimiter(10, 15 * 60_000),
      recover: new RateLimiter(10, 15 * 60_000),
      share: new RateLimiter(10, 5 * 60_000),
      update: new RateLimiter(5, 10 * 60_000),
    },
  };
}

export function disposeContainer(container: Container): void {
  // Cierre limpio: checkpoint de WAL y release del archivo.
  closeDatabase(container.db);
}
