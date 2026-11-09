import { join } from 'node:path';
import { loadConfig, type ApiConfig } from '../../src/config';

/** Config de test: defaults reales + directorios aislados + KDF rápido-pero-válido. */
export function makeTestConfig(rootDir: string, overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    ...loadConfig({}),
    port: 0,
    dataDir: join(rootDir, 'data'),
    publicDir: join(rootDir, 'public'),
    iterations: 100_000,
    ...overrides,
  };
}
