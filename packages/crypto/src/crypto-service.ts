/**
 * Implementación del puerto VaultCryptoService.
 *
 * - Derivación de clave: PBKDF2-HMAC-SHA256 (configurable, 310k iteraciones por defecto).
 * - Cifrado: AES-256-GCM (confidencialidad + integridad autenticada).
 * - Blob: [IV 12 bytes][AuthTag 16 bytes][Ciphertext].
 *
 * La clave NUNCA se persiste: la produce `deriveKey` en RAM y el SessionStore la retiene.
 */
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import type { VaultCryptoService } from '@secretvault/core';
import { DEFAULT_PBKDF2_ITERATIONS } from '@secretvault/shared';

const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM estándar
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const MIN_PBKDF2_ITERATIONS = 100_000; // suelo de seguridad

export class NodeCryptoService implements VaultCryptoService {
  defaultIterations(): number {
    return DEFAULT_PBKDF2_ITERATIONS;
  }

  generateSalt(): Uint8Array {
    return new Uint8Array(randomBytes(SALT_LENGTH));
  }

  async deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    if (salt.length < SALT_LENGTH) {
      throw new Error('La sal del KDF es inválida.');
    }
    if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS) {
      throw new Error(`PBKDF2 requiere al menos ${MIN_PBKDF2_ITERATIONS} iteraciones.`);
    }
    // pbkdf2Sync es una operación CPU-bound corta (~100ms con 310k iteraciones):
    // no bloquea el event loop de forma perceptible en una app local.
    const derived = pbkdf2Sync(
      password.normalize('NFKC'),
      Buffer.from(salt),
      iterations,
      KEY_LENGTH,
      'sha256',
    );
    return new Uint8Array(derived);
  }

  async encrypt(key: Uint8Array, plaintext: string, aad: string): Promise<Uint8Array> {
    this.assertKey(key);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([iv, tag, ciphertext]);
    return new Uint8Array(blob);
  }

  async decrypt(key: Uint8Array, blob: Uint8Array, aad: string): Promise<string> {
    this.assertKey(key);
    if (blob.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Blob cifrado corrupto.');
    }
    const iv = Buffer.from(blob.subarray(0, IV_LENGTH));
    const tag = Buffer.from(blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    const ciphertext = Buffer.from(blob.subarray(IV_LENGTH + TAG_LENGTH));
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // Clave incorrecta o blob manipulado: GCM no autentica.
      throw new Error('Fallo de desencriptado (clave incorrecta o datos alterados).');
    }
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  private assertKey(key: Uint8Array): void {
    if (key.length !== KEY_LENGTH) {
      throw new Error('La clave AES debe ser de 256 bits.');
    }
  }
}

/** Sobrescribe una clave con ceros. Best-effort en JS: reduce la ventana de exposición en RAM. */
export function zeroKey(key: Uint8Array): void {
  key.fill(0);
}
