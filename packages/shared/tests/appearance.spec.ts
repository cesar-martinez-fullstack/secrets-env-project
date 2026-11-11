import { describe, expect, it } from 'bun:test';
import { APP_NAME_MAX_LENGTH, DEFAULT_APPEARANCE, validateAppearance } from '../src/appearance';

describe('validateAppearance', () => {
  it('should accept the defaults', () => {
    expect(validateAppearance(DEFAULT_APPEARANCE)).toEqual([]);
  });

  it('should accept a name of exactly the maximum length', () => {
    const appName = 'x'.repeat(APP_NAME_MAX_LENGTH);

    expect(validateAppearance({ ...DEFAULT_APPEARANCE, appName })).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'x'.repeat(APP_NAME_MAX_LENGTH + 1)],
    ['with a newline', 'a\nb'],
    ['with a tab', 'a\tb'],
    ['not a string', 42],
  ])('should reject a name that is %s', (_label, appName) => {
    const issues = validateAppearance({ ...DEFAULT_APPEARANCE, appName });

    expect(issues.map((issue) => issue.field)).toEqual(['appName']);
  });

  it('should reject an accent or theme outside the allowed lists', () => {
    const issues = validateAppearance({
      ...DEFAULT_APPEARANCE,
      accent: 'red',
      defaultTheme: 'sepia',
    });

    expect(issues.map((issue) => issue.field)).toEqual(['accent', 'defaultTheme']);
  });
});
