import { UpdateCheckFailedError } from '@secretvault/core';
import type { LatestRelease, ReleaseSource } from '@secretvault/core';
import { RELEASES_REPOSITORY } from '@secretvault/shared';

/** Dirección FIJA: ningún dato de la persona usuaria ni de la bóveda entra en la petición. */
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPOSITORY}/releases/latest`;

const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 100_000;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_BYTES || !response.body) throw new UpdateCheckFailedError();

  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  // Salir del bucle con una excepción cancela la lectura del flujo.
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    received += chunk.byteLength;
    if (received > MAX_RESPONSE_BYTES) throw new UpdateCheckFailedError();
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function toRelease(document: unknown): LatestRelease | null {
  if (typeof document !== 'object' || document === null) throw new UpdateCheckFailedError();
  const { tag_name: tag, html_url: url, draft, prerelease } = document as Record<string, unknown>;
  if (draft === true || prerelease === true) return null;
  if (typeof tag !== 'string' || typeof url !== 'string') throw new UpdateCheckFailedError();
  return { tag, url };
}

/** Última versión publicada en GitHub: sin credenciales, sin redirecciones, con timeout y tope de tamaño. */
export class GithubReleaseSource implements ReleaseSource {
  constructor(private readonly fetcher: Fetcher = (input, init) => fetch(input, init)) {}

  async latestRelease(): Promise<LatestRelease | null> {
    let response: Response;
    try {
      response = await this.fetcher(LATEST_RELEASE_URL, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SecretVault' },
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new UpdateCheckFailedError();
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new UpdateCheckFailedError();

    try {
      return toRelease(JSON.parse(await readLimited(response)));
    } catch {
      throw new UpdateCheckFailedError();
    }
  }
}
