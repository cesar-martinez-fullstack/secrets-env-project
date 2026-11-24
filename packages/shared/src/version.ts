/** Repositorio oficial del que se leen las versiones publicadas. */
export const RELEASES_REPOSITORY = 'cesar-martinez-fullstack/secrets-env-project';

const STABLE_VERSION = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/;

type VersionParts = readonly [major: number, minor: number, patch: number];

function parseVersion(raw: string): VersionParts | null {
  const match = STABLE_VERSION.exec(raw.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** `X.Y.Z` normalizado, o `null` si no es una versión estable (sin prefijos ni pre-releases). */
export function normalizeVersion(raw: string): string | null {
  const parts = parseVersion(raw);
  return parts ? parts.join('.') : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  const difference = next.findIndex((part, index) => part !== installed[index]);
  return difference >= 0 && (next[difference] ?? 0) > (installed[difference] ?? 0);
}

/** Solo se muestran enlaces `https://github.com/<repo oficial>/releases/...`. */
export function isOfficialReleaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname.startsWith(`/${RELEASES_REPOSITORY}/releases/`)
    );
  } catch {
    return false;
  }
}
