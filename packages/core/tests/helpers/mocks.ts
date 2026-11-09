/**
 * Fábricas de repositorios mockeados (estilo jest.Mocked):
 * cada método es un jest.fn() tipado, construido por test con `beforeEach`.
 */
import { jest } from 'bun:test';
import type {
  AuditRepository,
  EnvironmentRepository,
  SecretRepository,
  VaultRepository,
} from '../../src/ports/repositories';
import type { VaultCryptoService } from '../../src/ports/crypto';
import type { SessionStore } from '../../src/ports/session';
import type { UnitOfWork } from '../../src/ports/transaction';

export interface MockVaultRepo {
  repo: VaultRepository;
  get: ReturnType<typeof jest.fn>;
  save: ReturnType<typeof jest.fn>;
}

export function mockVaultRepo(): MockVaultRepo {
  const get = jest.fn();
  const save = jest.fn();
  return { repo: { get, save }, get, save };
}

export interface MockEnvRepo {
  repo: EnvironmentRepository;
  list: ReturnType<typeof jest.fn>;
  listWithCounts: ReturnType<typeof jest.fn>;
  findById: ReturnType<typeof jest.fn>;
  findByName: ReturnType<typeof jest.fn>;
  create: ReturnType<typeof jest.fn>;
  rename: ReturnType<typeof jest.fn>;
  delete: ReturnType<typeof jest.fn>;
}

export function mockEnvRepo(): MockEnvRepo {
  const list = jest.fn();
  const listWithCounts = jest.fn();
  const findById = jest.fn();
  const findByName = jest.fn();
  const create = jest.fn();
  const rename = jest.fn();
  const remove = jest.fn();
  return {
    repo: { list, listWithCounts, findById, findByName, create, rename, delete: remove },
    list,
    listWithCounts,
    findById,
    findByName,
    create,
    rename,
    delete: remove,
  };
}

export interface MockSecretRepo {
  repo: SecretRepository;
  list: ReturnType<typeof jest.fn>;
  findById: ReturnType<typeof jest.fn>;
  findByName: ReturnType<typeof jest.fn>;
  create: ReturnType<typeof jest.fn>;
  update: ReturnType<typeof jest.fn>;
  delete: ReturnType<typeof jest.fn>;
}

export function mockSecretRepo(): MockSecretRepo {
  const list = jest.fn();
  const findById = jest.fn();
  const findByName = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  return {
    repo: { list, findById, findByName, create, update, delete: remove },
    list,
    findById,
    findByName,
    create,
    update,
    delete: remove,
  };
}

export interface MockAuditRepo {
  repo: AuditRepository;
  record: ReturnType<typeof jest.fn>;
  list: ReturnType<typeof jest.fn>;
  count: ReturnType<typeof jest.fn>;
  prune: ReturnType<typeof jest.fn>;
}

export function mockAuditRepo(): MockAuditRepo {
  const record = jest.fn();
  const list = jest.fn();
  const count = jest.fn();
  const prune = jest.fn();
  return {
    repo: { record, list, count, prune },
    record,
    list,
    count,
    prune,
  };
}

export interface MockCrypto {
  service: VaultCryptoService;
  generateSalt: ReturnType<typeof jest.fn>;
  defaultIterations: ReturnType<typeof jest.fn>;
  deriveKey: ReturnType<typeof jest.fn>;
  encrypt: ReturnType<typeof jest.fn>;
  decrypt: ReturnType<typeof jest.fn>;
  randomToken: ReturnType<typeof jest.fn>;
}

/** Crypto simulado: cifrado reversible simple para observar llamadas sin node:crypto. */
export function mockCrypto(): MockCrypto {
  const generateSalt = jest.fn().mockReturnValue(new Uint8Array(16).fill(7));
  const defaultIterations = jest.fn().mockReturnValue(310_000);
  const deriveKey = jest
    .fn()
    .mockImplementation(async (_password: string, salt: Uint8Array) => Uint8Array.from(salt));
  const encrypt = jest
    .fn()
    .mockImplementation(async (_key: Uint8Array, plaintext: string) =>
      new TextEncoder().encode(`enc:${plaintext}`),
    );
  const decrypt = jest
    .fn()
    .mockImplementation(async (_key: Uint8Array, blob: Uint8Array) =>
      new TextDecoder().decode(blob).replace(/^enc:/, ''),
    );
  const randomToken = jest.fn().mockReturnValue('token-abc123');
  return {
    service: { generateSalt, defaultIterations, deriveKey, encrypt, decrypt, randomToken },
    generateSalt,
    defaultIterations,
    deriveKey,
    encrypt,
    decrypt,
    randomToken,
  };
}

export interface MockSessions {
  store: SessionStore;
  create: ReturnType<typeof jest.fn>;
  get: ReturnType<typeof jest.fn>;
  touch: ReturnType<typeof jest.fn>;
  remove: ReturnType<typeof jest.fn>;
  rotateKey: ReturnType<typeof jest.fn>;
  purgeExpired: ReturnType<typeof jest.fn>;
  clear: ReturnType<typeof jest.fn>;
  count: ReturnType<typeof jest.fn>;
}

export function mockSessions(): MockSessions {
  const create = jest.fn();
  const get = jest.fn();
  const touch = jest.fn();
  const remove = jest.fn();
  const rotateKey = jest.fn();
  const purgeExpired = jest.fn().mockResolvedValue(0);
  const clear = jest.fn().mockResolvedValue(undefined);
  const count = jest.fn().mockResolvedValue(0);
  return {
    store: { create, get, touch, remove, rotateKey, purgeExpired, clear, count },
    create,
    get,
    touch,
    remove,
    rotateKey,
    purgeExpired,
    clear,
    count,
  };
}

/** UnitOfWork simulado: ejecuta el trabajo directamente (sin transaccion real). */
export function mockUnitOfWork(): UnitOfWork {
  return { run: async (work) => work() };
}
