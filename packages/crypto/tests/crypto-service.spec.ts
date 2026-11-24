/**
 * Tests de la implementación criptográfica REAL (node:crypto):
 * PBKDF2 + AES-256-GCM. Aquí no hay mocks — es la capa que no se puede fingir.
 */
import { describe, expect, it } from 'bun:test';
import { NodeCryptoService, zeroKey } from '../src/crypto-service';
import {
  AAD_SECRET_NOTE,
  AAD_SECRET_VALUE,
  AAD_VERIFIER,
  VERIFIER_PLAINTEXT,
} from '@secretvault/core';

const KEY = new Uint8Array(32).fill(42);
const SALT = new Uint8Array(16).fill(1);

describe('NodeCryptoService.deriveKey', () => {
  const service = new NodeCryptoService();

  it('should derive a deterministic 256-bit key from password+salt', async () => {
    const a = await service.deriveKey('pass', SALT, 600_000);
    const b = await service.deriveKey('pass', SALT, 600_000);
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('should produce different keys for different passwords', async () => {
    const a = await service.deriveKey('pass-a', SALT, 600_000);
    const b = await service.deriveKey('pass-b', SALT, 600_000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('should produce different keys for different salts', async () => {
    const a = await service.deriveKey('pass', SALT, 600_000);
    const b = await service.deriveKey('pass', new Uint8Array(16).fill(2), 600_000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('should enforce the iteration floor (no downgrade attacks)', async () => {
    await expect(service.deriveKey('pass', SALT, 1000)).rejects.toThrow('iteraciones');
    await expect(service.deriveKey('pass', SALT, 99_999)).rejects.toThrow('iteraciones');
  });

  it('should reject short salts', async () => {
    await expect(service.deriveKey('pass', new Uint8Array(8), 600_000)).rejects.toThrow('sal');
  });
});

describe('NodeCryptoService.encrypt/decrypt', () => {
  const service = new NodeCryptoService();

  it('should round-trip unicode plaintexts', async () => {
    const plaintext = 'postgres://admin:S3cr3t@host/db — ñáéíóú ✓';
    const blob = await service.encrypt(KEY, plaintext, AAD_SECRET_VALUE);
    expect(await service.decrypt(KEY, blob, AAD_SECRET_VALUE)).toBe(plaintext);
  });

  it('should produce blobs with layout [IV 12B][Tag 16B][Ciphertext]', async () => {
    const blob = await service.encrypt(KEY, 'hello', AAD_SECRET_VALUE);
    expect(blob.length).toBe(12 + 16 + 'hello'.length);
    // Mismo plaintext dos veces → ciphertext distinto (IV aleatorio, no ECB-style)
    const blob2 = await service.encrypt(KEY, 'hello', AAD_SECRET_VALUE);
    expect(Buffer.from(blob).equals(Buffer.from(blob2))).toBe(false);
  });

  it('should fail with a wrong key (wrong master password simulation)', async () => {
    const blob = await service.encrypt(KEY, 'secret', AAD_SECRET_VALUE);
    const wrongKey = new Uint8Array(32).fill(43);
    await expect(service.decrypt(wrongKey, blob, AAD_SECRET_VALUE)).rejects.toThrow(
      /clave incorrecta|alterados/,
    );
  });

  it('should detect tampered ciphertexts (GCM integrity)', async () => {
    const blob = await service.encrypt(KEY, 'secret', AAD_SECRET_VALUE);
    const tampered = Uint8Array.from(blob);
    tampered[tampered.length - 1]! ^= 0x01; // flip un bit del ciphertext
    await expect(service.decrypt(KEY, tampered, AAD_SECRET_VALUE)).rejects.toThrow();
  });

  it('should detect tampered auth tags', async () => {
    const blob = await service.encrypt(KEY, 'secret', AAD_SECRET_VALUE);
    const tampered = Uint8Array.from(blob);
    tampered[12]! ^= 0xff; // flip del tag
    await expect(service.decrypt(KEY, tampered, AAD_SECRET_VALUE)).rejects.toThrow();
  });

  it('should bind blobs to their AAD — no cross-field substitution', async () => {
    // Un blob cifrado como VALOR no debe poder descifrarse como NOTA ni como VERIFICADOR.
    const valueBlob = await service.encrypt(KEY, 'data', AAD_SECRET_VALUE);
    await expect(service.decrypt(KEY, valueBlob, AAD_SECRET_NOTE)).rejects.toThrow();
    await expect(service.decrypt(KEY, valueBlob, AAD_VERIFIER)).rejects.toThrow();

    const verifierBlob = await service.encrypt(KEY, VERIFIER_PLAINTEXT, AAD_VERIFIER);
    await expect(service.decrypt(KEY, verifierBlob, AAD_SECRET_VALUE)).rejects.toThrow();
  });

  it('should reject truncated or empty blobs', async () => {
    await expect(service.decrypt(KEY, new Uint8Array(10), AAD_SECRET_VALUE)).rejects.toThrow(
      'corrupto',
    );
    await expect(service.decrypt(KEY, new Uint8Array(0), AAD_SECRET_VALUE)).rejects.toThrow(
      'corrupto',
    );
  });

  it('should reject keys that are not 256-bit', async () => {
    const shortKey = new Uint8Array(16);
    await expect(service.encrypt(shortKey, 'x', AAD_SECRET_VALUE)).rejects.toThrow('256 bits');
  });
});

describe('NodeCryptoService.helpers', () => {
  const service = new NodeCryptoService();

  it('should generate 16-byte random salts (unique)', () => {
    const a = service.generateSalt();
    const b = service.generateSalt();
    expect(a).toHaveLength(16);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('should generate URL-safe random tokens', () => {
    const token = service.randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 chars base64url
    expect(service.randomToken(32)).not.toBe(token);
  });

  it('should default to 310k PBKDF2 iterations', () => {
    expect(service.defaultIterations()).toBe(600_000);
  });
});

describe('zeroKey', () => {
  it('should overwrite every byte with zero (RAM hygiene)', () => {
    const key = new Uint8Array(32).fill(0xab);
    zeroKey(key);
    expect(key.every((b) => b === 0)).toBe(true);
  });
});

describe('NodeCryptoService envelope encryption (DEK + recovery key)', () => {
  const service = new NodeCryptoService();

  it('should generate unique 256-bit keys', () => {
    const a = service.generateKey();
    const b = service.generateKey();
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('should derive a deterministic recovery KEK, different per key and per salt', async () => {
    const recovery = service.generateKey();
    const a = await service.deriveRecoveryKek(recovery, SALT);
    const b = await service.deriveRecoveryKek(recovery, SALT);
    const otherSalt = await service.deriveRecoveryKek(recovery, new Uint8Array(16).fill(2));
    const otherKey = await service.deriveRecoveryKek(service.generateKey(), SALT);

    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(otherSalt))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(otherKey))).toBe(false);
  });

  it('should reject recovery keys that are not 256 bits and weak salts', async () => {
    await expect(service.deriveRecoveryKek(new Uint8Array(16), SALT)).rejects.toThrow('256 bits');
    await expect(
      service.deriveRecoveryKek(service.generateKey(), new Uint8Array(8)),
    ).rejects.toThrow('sal');
  });

  it('should wrap and unwrap a key round-trip', async () => {
    const dek = service.generateKey();
    const wrapped = await service.wrapKey(KEY, dek, 'aad:dek');
    expect(wrapped.length).toBe(12 + 16 + 32); // IV + tag + clave
    const unwrapped = await service.unwrapKey(KEY, wrapped, 'aad:dek');
    expect(Buffer.from(unwrapped).equals(Buffer.from(dek))).toBe(true);
  });

  it('should not unwrap with the wrong KEK, the wrong AAD or a tampered blob', async () => {
    const dek = service.generateKey();
    const wrapped = await service.wrapKey(KEY, dek, 'aad:dek');

    await expect(
      service.unwrapKey(new Uint8Array(32).fill(7), wrapped, 'aad:dek'),
    ).rejects.toThrow();
    await expect(service.unwrapKey(KEY, wrapped, 'aad:otro')).rejects.toThrow();
    const tampered = new Uint8Array(wrapped);
    tampered.set([(tampered.at(-1) ?? 0) ^ 1], tampered.length - 1);
    await expect(service.unwrapKey(KEY, tampered, 'aad:dek')).rejects.toThrow();
  });

  it('should only wrap 256-bit keys', async () => {
    await expect(service.wrapKey(KEY, new Uint8Array(16), 'aad:dek')).rejects.toThrow('256 bits');
  });

  it('should produce a different wrapped blob each time (random IV)', async () => {
    const dek = service.generateKey();
    const a = await service.wrapKey(KEY, dek, 'aad:dek');
    const b = await service.wrapKey(KEY, dek, 'aad:dek');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});
