/**
 * Formato de texto de la clave de recuperación: 32 bytes aleatorios en Crockford base32
 * (52 caracteres) agrupados de 4 en 4 para poder anotarla o dictarla sin ambigüedades.
 *
 *   ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789-ABCD-EFGH-JKMN-PQRS-TVWX
 *
 * Crockford omite I, L, O y U; al decodificar se aceptan O→0 e I/L→1 por comodidad.
 * La decodificación es estricta: los 4 bits de relleno finales deben ser cero para que cada
 * clave tenga una única representación textual.
 */

/** Longitud de la clave de recuperación en bytes (256 bits). */
export const RECOVERY_KEY_BYTES = 32;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODED_LENGTH = 52; // ceil(256 / 5)
const GROUP_SIZE = 4;

export function encodeRecoveryKey(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new Error(`La clave de recuperación debe tener ${RECOVERY_KEY_BYTES} bytes.`);
  }
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g'))!.join('-');
}

/** Devuelve los 32 bytes, o `null` si el texto no es una clave de recuperación válida. */
export function decodeRecoveryKey(input: string): Uint8Array | null {
  const text = input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replaceAll('O', '0')
    .replaceAll('I', '1')
    .replaceAll('L', '1');
  if (text.length !== ENCODED_LENGTH) return null;

  const out = new Uint8Array(RECOVERY_KEY_BYTES);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return value === 0 ? out : null; // bits de relleno ≠ 0 → representación no canónica
}
