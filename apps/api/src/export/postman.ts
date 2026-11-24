import type { ExportInput } from './types';

/**
 * Postman Environment con la misma estructura que exporta Postman. Cada variable va como
 * `secret` para que Postman enmascare el valor; el `id` es nuevo en cada exportación.
 */
export function buildPostmanExport({ environmentName, generatedAt, entries }: ExportInput): string {
  const document = {
    id: crypto.randomUUID(),
    name: environmentName,
    values: entries.map(({ name, value }) => ({
      key: name,
      value,
      type: 'secret',
      enabled: true,
    })),
    color: null,
    _postman_variable_scope: 'environment',
    _postman_exported_at: generatedAt.toISOString(),
    _postman_exported_using: 'SecretVault',
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
