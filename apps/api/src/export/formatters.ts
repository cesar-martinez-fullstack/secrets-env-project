import { stringifyEnv, type ExportFormat } from '@secretvault/shared';
import { buildCsvExport } from './csv';
import { buildJsonExport } from './json';
import { buildPdfExport } from './pdf';
import type { ExportInput } from './types';

interface ExportFormatter {
  contentType: string;
  build(input: ExportInput): string | Uint8Array;
}

/** `satisfies` obliga a tener un exportador por cada formato de `ExportFormat`. */
export const EXPORT_FORMATTERS = {
  env: {
    contentType: 'text/plain; charset=utf-8',
    build: ({ environmentName, generatedAt, entries }) =>
      stringifyEnv(entries, {
        header: [
          `SecretVault — Ambiente: ${environmentName}`,
          `Generado: ${generatedAt.toISOString()}`,
          'ADVERTENCIA: este archivo contiene secretos en texto claro.',
        ].join('\n'),
      }),
  },
  csv: {
    contentType: 'text/csv; charset=utf-8',
    build: ({ entries }) => buildCsvExport(entries),
  },
  json: {
    contentType: 'application/json; charset=utf-8',
    build: buildJsonExport,
  },
  pdf: {
    contentType: 'application/pdf',
    build: buildPdfExport,
  },
} satisfies Record<ExportFormat, ExportFormatter>;

export function exportFilename(
  environmentName: string,
  generatedAt: Date,
  format: ExportFormat,
): string {
  const slug =
    environmentName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'ambiente';
  return `secretvault-${slug}-${generatedAt.toISOString().slice(0, 10)}.${format}`;
}
