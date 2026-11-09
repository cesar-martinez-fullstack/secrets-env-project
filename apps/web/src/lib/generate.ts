/**
 * Generador criptográfico de valores de secretos (Web Crypto).
 */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';

export function generateSecretValue(length = 24): string {
  const random = crypto.getRandomValues(new Uint32Array(length));
  const chars: string[] = [];
  for (const n of random) {
    chars.push(CHARSET[n % CHARSET.length]!);
  }
  return chars.join('');
}
