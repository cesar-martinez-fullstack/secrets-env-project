/**
 * Tests de los exportadores: .env, CSV (escaping) y PDF (estructura binaria).
 */
import { describe, expect, it } from 'bun:test';
import { buildCsvExport } from '../../src/export/csv';
import { buildPdfExport } from '../../src/export/pdf';

const ENTRIES = [
  {
    name: 'DATABASE_URL',
    value: 'postgres://admin:S3cr3t@localhost:5432/app',
    note: 'BD principal',
  },
  { name: 'API_KEY', value: 'sk_live_abcdef123456', note: null },
];

describe('CSV export', () => {
  it('should include a UTF-8 BOM and the header row', () => {
    const bytes = buildCsvExport(ENTRIES);
    // ignoreBOM evita que el decoder elimine el BOM que queremos verificar.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('name,value,note');
  });

  it('should escape commas, quotes and newlines per RFC 4180', () => {
    const bytes = buildCsvExport([
      { name: 'A', value: 'con,coma', note: 'con"comillas' },
      { name: 'B', value: 'multi\nlinea', note: null },
    ]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('A,"con,coma","con""comillas"');
    expect(text).toContain('"multi\nlinea"');
  });

  it('should emit CRLF line endings for Excel compatibility', () => {
    const text = new TextDecoder().decode(buildCsvExport(ENTRIES));
    expect(text.includes('\r\n')).toBe(true);
  });
});

describe('PDF export', () => {
  const options = {
    environmentName: 'Local',
    generatedAt: new Date('2026-01-15T10:30:00Z'),
    entries: ENTRIES,
    iterations: 310_000,
  };

  it('should produce a structurally valid PDF 1.4 document', () => {
    const pdf = buildPdfExport(options);
    const text = Buffer.from(pdf).toString('latin1');

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Pages');
    expect(text).toContain('/Type /Font');
    expect(text).toContain('xref');
    expect(text).toContain('startxref');
    expect(text).toContain('trailer');
  });

  it('should contain the decrypted values and the environment name', () => {
    const pdf = buildPdfExport(options);
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).toContain('DATABASE_URL');
    expect(text).toContain('postgres://admin:S3cr3t@localhost:5432/app');
    expect(text).toContain('Ambiente: Local');
    expect(text).toContain('ADVERTENCIA');
  });

  it('should escape PDF string metacharacters in values', () => {
    const pdf = buildPdfExport({
      ...options,
      entries: [{ name: 'EVIL', value: 'par(en)tesis \\y\\ (x)', note: null }],
    });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).toContain('par\\(en\\)tesis \\\\y\\\\ \\(x\\)');
  });

  it('should paginate for large vaults (row flow into new pages)', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      name: `VAR_${i}`,
      value: `value-${i}`,
      note: null,
    }));
    const pdf = buildPdfExport({ ...options, entries: many });
    const text = Buffer.from(pdf).toString('latin1');
    const pageObjects = text.match(/\/Type \/Page[^s]/g)?.length ?? 0;
    expect(pageObjects).toBeGreaterThan(1);
    expect(text).toContain('Página 2 de');
  });

  it('should handle empty environments gracefully', () => {
    const pdf = buildPdfExport({ ...options, entries: [] });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).toContain('No hay secretos');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
  });

  it('should replace non-latin1 characters instead of corrupting the stream', () => {
    const pdf = buildPdfExport({
      ...options,
      entries: [{ name: 'UNICODE', value: 'emoji 🚀 y kanji 漢字', note: null }],
    });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).toContain('?'); // sustituido, no roto
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
