/**
 * Tests de configuración: defaults, clamps y carga de `.env`
 * (precedencia entorno real > .env, walk-up de directorios y SV_ENV_FILE).
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config';

const ENV_KEYS = [
  'PORT',
  'HOST',
  'SV_DATA_DIR',
  'SV_PUBLIC_DIR',
  'SV_AUTO_LOCK_MINUTES',
  'SV_PBKDF2_ITERATIONS',
  'SV_COOKIE_SECURE',
  'SV_TRUST_PROXY',
  'SV_ENV_FILE',
] as const;

/** Aísla el entorno del proceso durante el test. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadConfig', () => {
  it('should use secure defaults for local development', () => {
    withEnv(
      {
        PORT: undefined,
        HOST: undefined,
        SV_DATA_DIR: undefined,
        SV_PUBLIC_DIR: undefined,
        SV_AUTO_LOCK_MINUTES: undefined,
        SV_PBKDF2_ITERATIONS: undefined,
      },
      () => {
        const config = loadConfig({});
        expect(config.port).toBe(3000);
        expect(config.host).toBe('127.0.0.1');
        expect(config.autoLockMinutes).toBe(15);
        expect(config.iterations).toBe(600_000);
        expect(config.cookieSecure).toBe(false);
        expect(config.trustProxy).toBe(false);
      },
    );
  });

  it('should read values from the provided environment', () => {
    const config = loadConfig({
      PORT: '8080',
      HOST: '127.0.0.1',
      SV_AUTO_LOCK_MINUTES: '5',
      SV_PBKDF2_ITERATIONS: '500000',
      SV_COOKIE_SECURE: 'true',
      SV_TRUST_PROXY: 'true',
    });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.autoLockMinutes).toBe(5);
    expect(config.iterations).toBe(500_000);
    expect(config.cookieSecure).toBe(true);
    expect(config.trustProxy).toBe(true);
  });

  it('should clamp out-of-range values (no downgrade below the PBKDF2 floor)', () => {
    const config = loadConfig({
      PORT: '99999',
      SV_AUTO_LOCK_MINUTES: '0',
      SV_PBKDF2_ITERATIONS: '100',
    });
    expect(config.port).toBe(65_535);
    expect(config.autoLockMinutes).toBe(1);
    expect(config.iterations).toBe(100_000);
  });

  it('should fall back to defaults on garbage input', () => {
    const config = loadConfig({ PORT: 'no-es-un-número', SV_AUTO_LOCK_MINUTES: '' });
    expect(config.port).toBe(3000);
    expect(config.autoLockMinutes).toBe(15);
  });
});

describe('loadDotEnv', () => {
  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sv-env-'));
    tempDirs.push(dir);
    return dir;
  }

  it('should return null when no .env exists in the chain', () => {
    const dir = makeTempDir();
    expect(loadDotEnv({})).toBeNull();
    expect(dir).toBeDefined();
  });

  it('should load an explicit SV_ENV_FILE with its values', () => {
    const dir = makeTempDir();
    const file = join(dir, 'custom.env');
    writeFileSync(file, 'SV_AUTO_LOCK_MINUTES=9\n# comentario\nSV_COOKIE_SECURE=true\n');

    const env: Record<string, string | undefined> = { SV_ENV_FILE: file };
    const loaded = loadDotEnv(env);

    expect(loaded).toBe(file);
    expect(env.SV_AUTO_LOCK_MINUTES).toBe('9');
    expect(env.SV_COOKIE_SECURE).toBe('true');
  });

  it('should give precedence to real environment variables over .env values', () => {
    const dir = makeTempDir();
    const file = join(dir, '.env');
    writeFileSync(file, 'SV_AUTO_LOCK_MINUTES=3\nSV_PBKDF2_ITERATIONS=120000\n');

    const env: Record<string, string | undefined> = {
      SV_ENV_FILE: file,
      SV_AUTO_LOCK_MINUTES: '7', // ya presente → el .env NO lo pisa
    };
    loadDotEnv(env);

    expect(env.SV_AUTO_LOCK_MINUTES).toBe('7');
    expect(env.SV_PBKDF2_ITERATIONS).toBe('120000');
  });

  it('should parse quotes, comments and CRLF without corrupting values', () => {
    const dir = makeTempDir();
    const file = join(dir, '.env');
    writeFileSync(file, 'SV_HOST="localhost"\r\nSV_COOKIE_SECURE=\r\n# ignórame\r\n');

    const env: Record<string, string | undefined> = { SV_ENV_FILE: file };
    loadDotEnv(env);

    expect(env.SV_HOST).toBe('localhost');
    expect(env.SV_COOKIE_SECURE).toBe('');
  });

  it('should walk up directories to find the monorepo root .env', () => {
    // Simula: cwd = apps/api con .env en el directorio padre.
    const root = makeTempDir();
    const child = join(root, 'apps', 'api');
    mkdirSync(child, { recursive: true });
    writeFileSync(join(root, '.env'), 'SV_AUTO_LOCK_MINUTES=4\n');

    const cwd = process.cwd();
    try {
      process.chdir(child);
      const env: Record<string, string | undefined> = {};
      const loaded = loadDotEnv(env);
      expect(loaded).toBe(join(root, '.env'));
      expect(env.SV_AUTO_LOCK_MINUTES).toBe('4');
    } finally {
      process.chdir(cwd);
    }
  });

  it('should integrate with loadConfig end-to-end (.env → config)', () => {
    const dir = makeTempDir();
    const file = join(dir, '.env');
    writeFileSync(file, 'SV_AUTO_LOCK_MINUTES=3\nSV_PBKDF2_ITERATIONS=120000\n');

    withEnv({ SV_ENV_FILE: file }, () => {
      loadDotEnv(); // muta el entorno real del proceso (como en producción)
      const config = loadConfig();
      expect(config.autoLockMinutes).toBe(3);
      expect(config.iterations).toBe(120_000);
    });
  });
});
