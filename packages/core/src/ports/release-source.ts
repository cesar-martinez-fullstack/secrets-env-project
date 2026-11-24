export interface LatestRelease {
  /** Etiqueta publicada, p. ej. `v0.2.1`. */
  tag: string;
  url: string;
}

/**
 * Origen de la última versión publicada. La implementación hace una petición saliente, así que
 * debe usar una dirección fija, tener timeout y límite de tamaño, y no enviar datos de la bóveda.
 */
export interface ReleaseSource {
  /** `null` si todavía no hay ninguna versión estable publicada. Lanza `UpdateCheckFailedError`. */
  latestRelease(): Promise<LatestRelease | null>;
}
