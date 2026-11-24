import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeVersion } from '@secretvault/shared';
import { APP_VERSION } from '../src/version';

describe('APP_VERSION', () => {
  it('should match the product version in the root package.json', () => {
    const root = JSON.parse(readFileSync(join(import.meta.dir, '../../../package.json'), 'utf8'));

    expect(APP_VERSION).toBe(root.version);
  });

  it('should be a stable X.Y.Z version', () => {
    expect(normalizeVersion(APP_VERSION)).toBe(APP_VERSION);
  });
});
