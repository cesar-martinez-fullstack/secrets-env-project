import { describe, expect, it } from 'bun:test';
import { API_ERROR_CODES, isApiErrorCode } from '../src/error-codes';

describe('isApiErrorCode', () => {
  it('should accept every code in the catalog', () => {
    for (const code of API_ERROR_CODES) {
      expect(isApiErrorCode(code)).toBe(true);
    }
  });

  it('should reject unknown codes', () => {
    expect(isApiErrorCode('NOT_A_REAL_CODE')).toBe(false);
    expect(isApiErrorCode(42)).toBe(false);
    expect(isApiErrorCode(null)).toBe(false);
    expect(isApiErrorCode(undefined)).toBe(false);
  });
});
