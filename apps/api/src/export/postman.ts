import type { ExportInput } from './types';

/** Postman Environment: cada variable va como `secret` para que Postman enmascare el valor. */
export function buildPostmanExport({ environmentName, generatedAt, entries }: ExportInput): string {
  const document = {
    name: environmentName,
    values: entries.map(({ name, value }) => ({
      key: name,
      value,
      type: 'secret',
      enabled: true,
    })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: generatedAt.toISOString(),
    _postman_exported_using: 'SecretVault',
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
