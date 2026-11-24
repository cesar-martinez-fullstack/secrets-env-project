import { LOGO_MAX_BYTES, detectLogoType } from '@secretvault/shared';
import type { LogoMimeType } from '@secretvault/shared';
import { ApiError } from '@/lib/api';

export async function readLogoFile(
  file: File,
): Promise<{ bytes: Uint8Array; mimeType: LogoMimeType }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = bytes.byteLength <= LOGO_MAX_BYTES ? detectLogoType(bytes) : null;
  if (mimeType === null) throw new ApiError('LOGO_INVALID', 'Imagen no válida.', 400);
  return { bytes, mimeType };
}
