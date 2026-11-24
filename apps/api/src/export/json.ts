import type { ExportInput } from './types';

export const JSON_EXPORT_VERSION = 1;

export function buildJsonExport({ environmentName, generatedAt, entries }: ExportInput): string {
  const document = {
    version: JSON_EXPORT_VERSION,
    exportedAt: generatedAt.toISOString(),
    secrets: entries.map(({ name, value, note }) => ({
      environment: environmentName,
      name,
      value,
      note,
    })),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
