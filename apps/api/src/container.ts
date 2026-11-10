/**
 * Raíz de composición (composition root): conecta las implementaciones concretas
 * (crypto, database, session-store) con los puertos que exige `core`.
 * Único lugar del código donde se conocen todas las capas.
 */
import {
  AuditService,
  EnvironmentService,
  ProjectService,
  SecretService,
  ShareService,
  VaultService,
  type SessionStore,
} from '@secretvault/core';
import { NodeCryptoService } from '@secretvault/crypto';
import {
  closeDatabase,
  createRepositories,
  openDatabase,
  SqliteUnitOfWork,
  type SqliteDatabase,
} from '@secretvault/database';
import { InMemorySessionStore } from './session-store';
import { RateLimiter } from './rate-limiter';
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
  auditService: AuditService;
  rateLimiters: {
    setup: RateLimiter;
    unlock: RateLimiter;
    changePassword: RateLimiter;
    recover: RateLimiter;
    share: RateLimiter;
  };
}

export function createContainer(config: ApiConfig): Container {
  const { db } = openDatabase(config.dataDir);
  const repositories = createRepositories(db);
  const unitOfWork = new SqliteUnitOfWork(db);
  const crypto = new NodeCryptoService();
  const sessionStore = new InMemorySessionStore(crypto, config.sessionMaxMinutes);

  const vaultService = new VaultService({
    vaultRepo: repositories.vault,
    projects: repositories.projects,
    environments: repositories.environments,
    crypto,
    sessions: sessionStore,
    audit: repositories.audit,
    unitOfWork,
    config: { iterations: config.iterations, autoLockMinutes: config.autoLockMinutes },
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

  const auditService = new AuditService({ audit: repositories.audit });

  return {
    config,
    db,
    sessionStore,
    vaultService,
    projectService,
    environmentService,
    secretService,
    shareService,
    auditService,
    rateLimiters: {
      // 20 setups / 10 min; 10 unlocks fallidos / 5 min; 10 cambios / 15 min; 10 recuperaciones / 15 min (por IP).
      setup: new RateLimiter(20, 10 * 60_000),
      unlock: new RateLimiter(10, 5 * 60_000),
      changePassword: new RateLimiter(10, 15 * 60_000),
      recover: new RateLimiter(10, 15 * 60_000),
      share: new RateLimiter(10, 5 * 60_000),
    },
  };
}

export function disposeContainer(container: Container): void {
  // Cierre limpio: checkpoint de WAL y release del archivo.
  closeDatabase(container.db);
}
