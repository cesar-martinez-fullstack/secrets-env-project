/**
 * Implementación del puerto VaultCryptoService.
 *
 * - Derivación de clave desde la contraseña: PBKDF2-HMAC-SHA256 (600k iteraciones por defecto).
 * - Derivación desde la clave de recuperación: HKDF-SHA256 (la clave ya tiene 256 bits de entropía).
 * - Cifrado y envoltura de claves: AES-256-GCM.
 * - Blob: [IV 12 bytes][AuthTag 16 bytes][Ciphertext].
 *
 * Ninguna clave se persiste: las produce la derivación/generación en RAM y el SessionStore las retiene.
 */
import { createCipheriv, createDecipheriv, hkdfSync, pbkdf2Sync, randomBytes } from 'node:crypto';
import type { VaultCryptoService } from '@secretvault/core';
import { DEFAULT_PBKDF2_ITERATIONS, RECOVERY_KEY_BYTES } from '@secretvault/shared';

const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM estándar
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const MIN_PBKDF2_ITERATIONS = 100_000; // suelo de seguridad
const RECOVERY_KEK_INFO = 'secretvault:recovery-kek:v1';

export class NodeCryptoService implements VaultCryptoService {
  defaultIterations(): number {
    return DEFAULT_PBKDF2_ITERATIONS;
  }

  generateSalt(): Uint8Array {
    return new Uint8Array(randomBytes(SALT_LENGTH));
  }

  generateKey(): Uint8Array {
    return new Uint8Array(randomBytes(KEY_LENGTH));
  }

  async deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    this.assertSalt(salt);
    if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS) {
      throw new Error(`PBKDF2 requiere al menos ${MIN_PBKDF2_ITERATIONS} iteraciones.`);
    }
    // pbkdf2Sync es una operación CPU-bound corta (~200ms con 600k iteraciones):
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

  async deriveRecoveryKek(recoveryKey: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
    if (recoveryKey.length !== RECOVERY_KEY_BYTES) {
      throw new Error('La clave de recuperación debe ser de 256 bits.');
    }
    this.assertSalt(salt);
    const derived = hkdfSync('sha256', recoveryKey, salt, RECOVERY_KEK_INFO, KEY_LENGTH);
    return new Uint8Array(derived);
  }

  async encrypt(key: Uint8Array, plaintext: string, aad: string): Promise<Uint8Array> {
    return this.seal(key, Buffer.from(plaintext, 'utf8'), aad);
  }

  async decrypt(key: Uint8Array, blob: Uint8Array, aad: string): Promise<string> {
    return Buffer.from(this.open(key, blob, aad)).toString('utf8');
  }

  async wrapKey(kek: Uint8Array, key: Uint8Array, aad: string): Promise<Uint8Array> {
    this.assertKey(key);
    return this.seal(kek, key, aad);
  }

  async unwrapKey(kek: Uint8Array, wrapped: Uint8Array, aad: string): Promise<Uint8Array> {
    const key = this.open(kek, wrapped, aad);
    this.assertKey(key);
    return key;
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** AES-256-GCM: devuelve [IV][tag][ciphertext]. */
  private seal(key: Uint8Array, data: Uint8Array, aad: string): Uint8Array {
    this.assertKey(key);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
  }

  private open(key: Uint8Array, blob: Uint8Array, aad: string): Uint8Array {
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
      return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
    } catch {
      // Clave incorrecta o blob manipulado: GCM no autentica.
      throw new Error('Fallo de desencriptado (clave incorrecta o datos alterados).');
    }
  }

  private assertKey(key: Uint8Array): void {
    if (key.length !== KEY_LENGTH) {
      throw new Error('La clave AES debe ser de 256 bits.');
    }
  }

  private assertSalt(salt: Uint8Array): void {
    if (salt.length < SALT_LENGTH) {
      throw new Error('La sal del KDF es inválida.');
    }
  }
}

/** Sobrescribe una clave con ceros. Best-effort en JS: reduce la ventana de exposición en RAM. */
export function zeroKey(key: Uint8Array): void {
  key.fill(0);
}
