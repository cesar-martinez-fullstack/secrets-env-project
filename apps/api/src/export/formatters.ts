import { stringifyEnv, type ExportFormat } from '@secretvault/shared';
import { buildCsvExport } from './csv';
import { buildJsonExport } from './json';
import { buildPdfExport } from './pdf';
import { buildPostmanExport } from './postman';
import type { ExportInput } from './types';

interface ExportFormatter {
  contentType: string;
  extension: string;
  build(input: ExportInput): string | Uint8Array;
}

/** `satisfies` obliga a tener un exportador por cada formato de `ExportFormat`. */
export const EXPORT_FORMATTERS = {
  env: {
    contentType: 'text/plain; charset=utf-8',
    extension: 'env',
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
    extension: 'csv',
    build: ({ entries }) => buildCsvExport(entries),
  },
  json: {
    contentType: 'application/json; charset=utf-8',
    extension: 'json',
    build: buildJsonExport,
  },
  pdf: {
    contentType: 'application/pdf',
    extension: 'pdf',
    build: buildPdfExport,
  },
  postman: {
    contentType: 'application/json; charset=utf-8',
    extension: 'postman_environment.json',
    build: buildPostmanExport,
  },
} satisfies Record<ExportFormat, ExportFormatter>;

export function fileSlug(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || fallback
  );
}

export function exportFilename(
  environmentName: string,
  generatedAt: Date,
  format: ExportFormat,
): string {
  return `secretvault-${fileSlug(environmentName, 'ambiente')}-${generatedAt.toISOString().slice(0, 10)}.${EXPORT_FORMATTERS[format].extension}`;
}
