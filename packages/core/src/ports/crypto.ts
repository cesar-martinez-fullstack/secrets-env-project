/**
 * Contrato del servicio criptográfico (puerto).
 * La implementación vive en `@secretvault/crypto` (AES-256-GCM + PBKDF2).
 *
 * Formato del blob cifrado (definido por la implementación):
 *   [IV 12 bytes][AuthTag 16 bytes][Ciphertext...]
 *
 * El AAD (additional authenticated data) liga cada ciphertext a un contexto,
 * impidiendo que un blob de un campo pueda sustituirse en otro (p.ej. nota → valor).
 */

/** Prefijo del AAD de valores de secretos (se completa con el contexto de la fila). */
export const AAD_SECRET_VALUE = 'secretvault:aad:secret-value:v2';
/** Prefijo del AAD de notas de secretos (se completa con el contexto de la fila). */
export const AAD_SECRET_NOTE = 'secretvault:aad:secret-note:v2';
/** AAD para el verificador de la contraseña maestra. */
export const AAD_VERIFIER = 'secretvault:aad:verifier:v1';
/** AAD de la clave de datos (DEK) envuelta con la clave derivada de la contraseña maestra. */
export const AAD_DEK_MASTER = 'secretvault:aad:dek-master:v1';
/** AAD de la clave de datos (DEK) envuelta con la clave de recuperación. */
export const AAD_DEK_RECOVERY = 'secretvault:aad:dek-recovery:v1';
/** Texto plano conocido cifrado dentro del verificador. */
export const VERIFIER_PLAINTEXT = 'secretvault/verifier/v1';

/**
 * AAD de un valor: liga el blob al AMBIENTE y al NOMBRE de su fila. Un atacante con
 * acceso de escritura al disco no puede mover el valor cifrado de `PROD_DB` a la fila
 * `DEV_DB`: el tag GCM fallaría al descifrar. Renombrar un secreto implica re-cifrarlo.
 */
export function secretValueAad(environmentId: number, name: string): string {
  return `${AAD_SECRET_VALUE}:${environmentId}:${name}`;
}

/** AAD de una nota (mismo criterio que `secretValueAad`). */
export function secretNoteAad(environmentId: number, name: string): string {
  return `${AAD_SECRET_NOTE}:${environmentId}:${name}`;
}

export interface VaultCryptoService {
  /** Bytes aleatorios criptográficamente seguros para la sal del KDF. */
  generateSalt(): Uint8Array;

  /** Iteraciones PBKDF2 recomendadas por la configuración vigente. */
  defaultIterations(): number;

  /**
   * Deriva una clave AES-256 a partir de la contraseña maestra.
   * PBKDF2-HMAC-SHA256. La clave resultante vive solo en RAM.
   */
  deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>;

  /** Cifra `plaintext` con AES-256-GCM y devuelve el blob opaco. */
  encrypt(key: Uint8Array, plaintext: string, aad: string): Promise<Uint8Array>;

  /**
   * Descifra un blob AES-256-GCM. Falla (reject) si la clave es incorrecta
   * o el blob fue manipulado (el tag GCM no autentica).
   */
  decrypt(key: Uint8Array, blob: Uint8Array, aad: string): Promise<string>;

  /** Clave aleatoria de 256 bits (clave de datos y clave de recuperación). */
  generateKey(): Uint8Array;

  /**
   * Deriva la KEK de la clave de recuperación (HKDF-SHA256). La clave de recuperación ya
   * tiene 256 bits de entropía, así que no necesita un KDF lento como la contraseña.
   */
  deriveRecoveryKek(recoveryKey: Uint8Array, salt: Uint8Array): Promise<Uint8Array>;

  /** Envuelve (cifra) una clave con otra usando AES-256-GCM. */
  wrapKey(kek: Uint8Array, key: Uint8Array, aad: string): Promise<Uint8Array>;

  /** Desenvuelve una clave. Falla si la KEK es incorrecta o el blob fue alterado. */
  unwrapKey(kek: Uint8Array, wrapped: Uint8Array, aad: string): Promise<Uint8Array>;

  /** Token aleatorio URL-safe (sesiones). */
  randomToken(bytes?: number): string;
}
