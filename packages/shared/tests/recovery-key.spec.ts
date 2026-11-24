import { describe, expect, it } from 'bun:test';
import { RECOVERY_KEY_BYTES, decodeRecoveryKey, encodeRecoveryKey } from '../src';

const sample = (): Uint8Array =>
  Uint8Array.from({ length: RECOVERY_KEY_BYTES }, (_, i) => i * 7 + 3);

describe('recovery key format', () => {
  it('should encode 32 bytes as 13 groups of 4 base32 characters', () => {
    const text = encodeRecoveryKey(sample());
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('should round-trip every possible byte value', () => {
    for (const fill of [0, 1, 127, 128, 255]) {
      const bytes = new Uint8Array(RECOVERY_KEY_BYTES).fill(fill);
      expect(decodeRecoveryKey(encodeRecoveryKey(bytes))).toEqual(bytes);
    }
    const mixed = sample();
    expect(decodeRecoveryKey(encodeRecoveryKey(mixed))).toEqual(mixed);
  });

  it('should be tolerant to case, spaces, missing hyphens and look-alike characters', () => {
    const bytes = sample();
    const canonical = encodeRecoveryKey(bytes);
    expect(decodeRecoveryKey(canonical.toLowerCase())).toEqual(bytes);
    expect(decodeRecoveryKey(canonical.replaceAll('-', ' '))).toEqual(bytes);
    expect(decodeRecoveryKey(canonical.replaceAll('-', ''))).toEqual(bytes);
    expect(decodeRecoveryKey(`  ${canonical}\n`)).toEqual(bytes);
    // Crockford: O→0, I/L→1
    const ambiguous = canonical.replaceAll('0', 'O').replaceAll('1', 'l');
    expect(decodeRecoveryKey(ambiguous)).toEqual(bytes);
  });

  it('should reject wrong length, invalid characters and empty input', () => {
    const canonical = encodeRecoveryKey(sample());
    expect(decodeRecoveryKey('')).toBeNull();
    expect(decodeRecoveryKey(canonical.slice(0, -1))).toBeNull();
    expect(decodeRecoveryKey(`${canonical}A`)).toBeNull();
    expect(decodeRecoveryKey(canonical.replace(/^./, 'U'))).toBeNull(); // U no existe en Crockford
    expect(decodeRecoveryKey('x'.repeat(52))).toBeNull();
  });

  it('should reject non-canonical trailing bits (a different string for the same bytes)', () => {
    const canonical = encodeRecoveryKey(new Uint8Array(RECOVERY_KEY_BYTES));
    const tampered = canonical.slice(0, -1) + 'F'; // últimos 4 bits de relleno ≠ 0
    expect(decodeRecoveryKey(tampered)).toBeNull();
  });

  it('should refuse to encode anything but 32 bytes', () => {
    expect(() => encodeRecoveryKey(new Uint8Array(16))).toThrow();
  });
});
