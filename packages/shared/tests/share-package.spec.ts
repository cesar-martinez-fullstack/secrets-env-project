import { describe, expect, it } from 'bun:test';
import {
  SHARE_FORMAT,
  SHARE_MAX_ITERATIONS,
  SHARE_MIN_ITERATIONS,
  SHARE_VERSION,
  decodeBase64,
  encodeBase64,
  parseShareEnvelope,
  parseSharePayload,
  validateSharePassphrase,
} from '../src';

const envelope = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    iterations: 600_000,
    salt: encodeBase64(new Uint8Array(16)),
    data: encodeBase64(new Uint8Array(40)),
    ...overrides,
  });

describe('base64', () => {
  it('should round-trip arbitrary bytes', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it('should handle payloads larger than the argument limit', () => {
    const bytes = new Uint8Array(2 * 1024 * 1024).fill(7);
    expect(decodeBase64(encodeBase64(bytes))?.length).toBe(bytes.length);
  });
  it('should reject text that is not base64', () => {
    expect(decodeBase64('***')).toBeNull();
  });
});

describe('validateSharePassphrase', () => {
  it('should accept a passphrase of at least 12 characters', () => {
    expect(validateSharePassphrase('twelve chars')).toEqual([]);
  });

  it('should reject a short passphrase', () => {
    expect(validateSharePassphrase('short')).toHaveLength(1);
  });
});

describe('parseShareEnvelope', () => {
  it('should parse a valid envelope', () => {
    const parsed = parseShareEnvelope(envelope());
    expect(parsed?.iterations).toBe(600_000);
    expect(parsed?.salt.length).toBe(16);
  });

  it('should reject text that is not JSON', () => {
    expect(parseShareEnvelope('not json')).toBeNull();
  });

  it('should reject a different format or an unknown version', () => {
    expect(parseShareEnvelope(envelope({ format: 'other' }))).toBeNull();
    expect(parseShareEnvelope(envelope({ version: 2 }))).toBeNull();
  });

  it('should reject iteration counts outside the allowed range', () => {
    expect(parseShareEnvelope(envelope({ iterations: SHARE_MIN_ITERATIONS - 1 }))).toBeNull();
    expect(parseShareEnvelope(envelope({ iterations: SHARE_MAX_ITERATIONS + 1 }))).toBeNull();
    expect(parseShareEnvelope(envelope({ iterations: 1.5e5 + 0.5 }))).toBeNull();
  });

  it('should reject a short salt or malformed base64', () => {
    expect(parseShareEnvelope(envelope({ salt: encodeBase64(new Uint8Array(4)) }))).toBeNull();
    expect(parseShareEnvelope(envelope({ data: '***' }))).toBeNull();
  });
});

describe('parseSharePayload', () => {
  const payload = {
    project: 'Checkout',
    environments: [{ name: 'Local', secrets: [{ name: 'API_KEY', value: 'v', note: null }] }],
  };

  it('should parse a valid payload', () => {
    expect(parseSharePayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('should reject a payload with the wrong shape', () => {
    expect(parseSharePayload('{}')).toBeNull();
    expect(parseSharePayload(JSON.stringify({ ...payload, project: 7 }))).toBeNull();
    expect(
      parseSharePayload(JSON.stringify({ ...payload, environments: [{ name: 'x' }] })),
    ).toBeNull();
  });

  it('should treat a missing note as null', () => {
    const noNote = {
      project: 'P',
      environments: [{ name: 'E', secrets: [{ name: 'A', value: 'v' }] }],
    };
    expect(parseSharePayload(JSON.stringify(noNote))?.environments[0]?.secrets[0]?.note).toBeNull();
  });
});
