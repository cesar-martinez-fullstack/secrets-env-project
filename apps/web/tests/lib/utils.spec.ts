/**
 * Tests de utilidades puras del frontend (corren con el mismo runner: bun test).
 */
import { describe, expect, it } from 'bun:test';
import { absoluteTime, relativeTime } from '../../src/lib/time';
import { generateSecretValue } from '../../src/lib/generate';

describe('relativeTime / absoluteTime', () => {
  it('should format recent timestamps as relative Spanish strings', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const text = relativeTime(fiveMinutesAgo);
    expect(text).toMatch(/minuto/i);
  });

  it('should format seconds for just-now timestamps', () => {
    const text = relativeTime(new Date(Date.now() - 5_000).toISOString());
    expect(text).toMatch(/segundo/i);
  });

  it('should produce locale absolute timestamps', () => {
    const text = absoluteTime('2026-01-15T10:30:00.000Z');
    expect(text.length).toBeGreaterThan(5);
    expect(text).not.toContain('Invalid Date');
  });
});

describe('generateSecretValue', () => {
  it('should generate values of the requested length', () => {
    expect(generateSecretValue(24)).toHaveLength(24);
    expect(generateSecretValue(64)).toHaveLength(64);
  });

  it('should use an unambiguous charset (sin 0/O/1/l ambiguos de fuente)', () => {
    for (let i = 0; i < 50; i++) {
      const value = generateSecretValue(32);
      expect(value).toMatch(/^[A-HJ-NP-Za-km-z23456789!@#$%^&*_=+-]+$/);
    }
  });

  it('should be random (dos llamadas no coinciden)', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateSecretValue(24)));
    expect(values.size).toBe(20);
  });
});
