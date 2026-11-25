/**
 * Copia consistente de TODA la base (secretos cifrados y metadatos). La implementación no debe
 * descifrar nada: el archivo resultante conserva el cifrado en reposo del original.
 */
export interface VaultBackup {
  snapshot(): Promise<Uint8Array>;
}
