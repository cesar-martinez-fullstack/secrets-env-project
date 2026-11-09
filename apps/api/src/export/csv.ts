/**
 * Exportador CSV (RFC 4180 con BOM UTF-8 para Excel).
 */
import type { ExportEntry } from '@secretvault/core';

export function buildCsvExport(entries: ExportEntry[]): Uint8Array {
  const rows: string[] = ['name,value,note'];
  for (const entry of entries) {
    rows.push([entry.name, entry.value, entry.note ?? ''].map(csvEscape).join(','));
  }
  // BOM para que Excel/Sheets detecte UTF-8.
  return new TextEncoder().encode('\uFEFF' + rows.join('\r\n') + '\r\n');
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
