import { describe, expect, it } from 'bun:test';
import { DEFAULT_APPEARANCE } from '@secretvault/shared';
import { hasAppearanceChanges } from '../../src/lib/first-run';

describe('hasAppearanceChanges', () => {
  it('should be false for the defaults', () => {
    expect(hasAppearanceChanges({ ...DEFAULT_APPEARANCE })).toBe(false);
  });

  it('should ignore surrounding spaces in the name', () => {
    expect(hasAppearanceChanges({ ...DEFAULT_APPEARANCE, appName: '  SecretVault  ' })).toBe(false);
  });

  it.each([
    ['name', { appName: 'Casa Segura' }],
    ['accent', { accent: 'teal' }],
    ['theme', { defaultTheme: 'dark' }],
  ] as const)('should be true when the %s changes', (_field, change) => {
    expect(hasAppearanceChanges({ ...DEFAULT_APPEARANCE, ...change })).toBe(true);
  });
});
