/**
 * Fábricas de repositorios mockeados (estilo jest.Mocked):
 * cada método es un jest.fn() tipado, construido por test con `beforeEach`.
 */
import { jest } from 'bun:test';
import type {
  AuditRepository,
  EnvironmentRepository,
  ProjectRepository,
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

export interface MockProjectRepo {
  repo: ProjectRepository;
  listWithCounts: ReturnType<typeof jest.fn>;
  findById: ReturnType<typeof jest.fn>;
  findByName: ReturnType<typeof jest.fn>;
  create: ReturnType<typeof jest.fn>;
  rename: ReturnType<typeof jest.fn>;
  delete: ReturnType<typeof jest.fn>;
  countEnvironments: ReturnType<typeof jest.fn>;
}

export function mockProjectRepo(): MockProjectRepo {
  const listWithCounts = jest.fn();
  const findById = jest.fn();
  const findByName = jest.fn();
  const create = jest.fn();
  const rename = jest.fn();
  const remove = jest.fn();
  const countEnvironments = jest.fn();
  return {
    repo: {
      listWithCounts,
      findById,
      findByName,
      create,
      rename,
      delete: remove,
      countEnvironments,
    },
    listWithCounts,
    findById,
    findByName,
    create,
    rename,
    delete: remove,
    countEnvironments,
  };
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
  generateKey: ReturnType<typeof jest.fn>;
  deriveRecoveryKek: ReturnType<typeof jest.fn>;
  wrapKey: ReturnType<typeof jest.fn>;
  unwrapKey: ReturnType<typeof jest.fn>;
  randomToken: ReturnType<typeof jest.fn>;
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const unhex = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'hex'));
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Clave de 32 bytes determinista a partir de un texto (simula un KDF: misma entrada → misma clave). */
function fakeKey(seed: string): Uint8Array {
  const out = new Uint8Array(32);
  let h = 2166136261;
  for (let i = 0; i < 32; i++) {
    for (const ch of `${seed}|${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    out[i] = h & 255;
  }
  return out;
}

/**
 * Crypto simulado.
 *
 * - Modo por defecto (legado): `enc:<texto>`, ignora clave y AAD. Suficiente para probar la
 *   orquestación de los servicios de secretos.
 * - `strict: true`: simula la AUTENTICACIÓN de GCM. El blob guarda la clave y el AAD con que se
 *   cifró y `decrypt`/`unwrapKey` lanzan si no coinciden. Así los tests de la bóveda comprueban de
 *   verdad que una contraseña o clave de recuperación equivocadas no abren nada.
 */
export function mockCrypto(options: { strict?: boolean } = {}): MockCrypto {
  const strict = options.strict ?? false;
  let counter = 0;
  const next = (label: string): Uint8Array => fakeKey(`${label}#${++counter}`);

  const generateSalt = jest.fn().mockImplementation(() => next('salt').slice(0, 16));
  const defaultIterations = jest.fn().mockReturnValue(600_000);
  const deriveKey = jest
    .fn()
    .mockImplementation(async (password: string, salt: Uint8Array) =>
      fakeKey(`pw:${password}:${hex(salt)}`),
    );
  const deriveRecoveryKek = jest
    .fn()
    .mockImplementation(async (recoveryKey: Uint8Array, salt: Uint8Array) =>
      fakeKey(`rk:${hex(recoveryKey)}:${hex(salt)}`),
    );
  const generateKey = jest.fn().mockImplementation(() => next('key'));

  const seal = (key: Uint8Array, payload: string, aad: string): Uint8Array =>
    enc(`sealed|${hex(key)}|${aad}|${payload}`);
  const open = (key: Uint8Array, blob: Uint8Array, aad: string): string => {
    const [tag, keyHex, blobAad, ...rest] = dec(blob).split('|');
    if (tag !== 'sealed' || keyHex !== hex(key) || blobAad !== aad) {
      throw new Error('Fallo de desencriptado (clave incorrecta o datos alterados).');
    }
    return rest.join('|');
  };

  const encrypt = jest
    .fn()
    .mockImplementation(async (key: Uint8Array, plaintext: string, aad: string) =>
      strict ? seal(key, plaintext, aad) : enc(`enc:${plaintext}`),
    );
  const decrypt = jest
    .fn()
    .mockImplementation(async (key: Uint8Array, blob: Uint8Array, aad: string) =>
      strict ? open(key, blob, aad) : dec(blob).replace(/^enc:/, ''),
    );
  const wrapKey = jest
    .fn()
    .mockImplementation(async (kek: Uint8Array, key: Uint8Array, aad: string) =>
      seal(kek, hex(key), aad),
    );
  const unwrapKey = jest
    .fn()
    .mockImplementation(async (kek: Uint8Array, wrapped: Uint8Array, aad: string) =>
      unhex(open(kek, wrapped, aad)),
    );
  const randomToken = jest.fn().mockReturnValue('token-abc123');

  return {
    service: {
      generateSalt,
      defaultIterations,
      deriveKey,
      encrypt,
      decrypt,
      generateKey,
      deriveRecoveryKek,
      wrapKey,
      unwrapKey,
      randomToken,
    },
    generateSalt,
    defaultIterations,
    deriveKey,
    encrypt,
    decrypt,
    generateKey,
    deriveRecoveryKek,
    wrapKey,
    unwrapKey,
    randomToken,
  };
}

export interface MockSessions {
  store: SessionStore;
  create: ReturnType<typeof jest.fn>;
  get: ReturnType<typeof jest.fn>;
  touch: ReturnType<typeof jest.fn>;
  remove: ReturnType<typeof jest.fn>;
  purgeExpired: ReturnType<typeof jest.fn>;
  clear: ReturnType<typeof jest.fn>;
  count: ReturnType<typeof jest.fn>;
}

export function mockSessions(): MockSessions {
  const create = jest.fn();
  const get = jest.fn();
  const touch = jest.fn();
  const remove = jest.fn();
  const purgeExpired = jest.fn().mockResolvedValue(0);
  const clear = jest.fn().mockResolvedValue(undefined);
  const count = jest.fn().mockResolvedValue(0);
  return {
    store: { create, get, touch, remove, purgeExpired, clear, count },
    create,
    get,
    touch,
    remove,
    purgeExpired,
    clear,
    count,
  };
}

/** UnitOfWork simulado: ejecuta el trabajo directamente (sin transaccion real). */
export function mockUnitOfWork(): UnitOfWork {
  return { run: async (work) => work() };
}
