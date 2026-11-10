/**
 * Tests de los exportadores: .env, CSV (escaping) y PDF (estructura binaria).
 */
import { describe, expect, it } from 'bun:test';
import { EXPORT_FORMATS } from '@secretvault/shared';
import { buildCsvExport } from '../../src/export/csv';
import { EXPORT_FORMATTERS, exportFilename } from '../../src/export/formatters';
import { buildJsonExport } from '../../src/export/json';
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

const INPUT = {
  environmentName: 'Local',
  generatedAt: new Date('2026-01-15T10:30:00Z'),
  entries: ENTRIES,
  iterations: 600_000,
};

describe('JSON export', () => {
  it('should produce a versioned document with the environment on every secret', () => {
    expect(JSON.parse(buildJsonExport(INPUT))).toEqual({
      version: 1,
      exportedAt: '2026-01-15T10:30:00.000Z',
      secrets: [
        {
          environment: 'Local',
          name: 'DATABASE_URL',
          value: 'postgres://admin:S3cr3t@localhost:5432/app',
          note: 'BD principal',
        },
        { environment: 'Local', name: 'API_KEY', value: 'sk_live_abcdef123456', note: null },
      ],
    });
  });

  it('should round-trip values that need escaping', () => {
    const tricky = 'línea 1\nlínea "2"\t\\ ñ 🔐 </script>';
    const doc = JSON.parse(
      buildJsonExport({ ...INPUT, entries: [{ name: 'TRICKY', value: tricky, note: tricky }] }),
    ) as { secrets: { value: string; note: string }[] };
    expect(doc.secrets[0]?.value).toBe(tricky);
    expect(doc.secrets[0]?.note).toBe(tricky);
  });

  it('should be indented and end with a newline', () => {
    const text = buildJsonExport(INPUT);
    expect(text.startsWith('{\n  "version": 1,')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('should export an empty environment as an empty list', () => {
    const doc = JSON.parse(buildJsonExport({ ...INPUT, entries: [] })) as { secrets: unknown[] };
    expect(doc.secrets).toEqual([]);
  });
});

describe('export formatters', () => {
  it('should provide a formatter for every export format', () => {
    for (const format of EXPORT_FORMATS) expect(EXPORT_FORMATTERS[format]).toBeDefined();
  });

  it('should declare the content type of each format', () => {
    expect(EXPORT_FORMATTERS.env.contentType).toBe('text/plain; charset=utf-8');
    expect(EXPORT_FORMATTERS.csv.contentType).toBe('text/csv; charset=utf-8');
    expect(EXPORT_FORMATTERS.json.contentType).toBe('application/json; charset=utf-8');
    expect(EXPORT_FORMATTERS.pdf.contentType).toBe('application/pdf');
  });

  it('should build non-empty output for every format', () => {
    for (const format of EXPORT_FORMATS) {
      expect(EXPORT_FORMATTERS[format].build(INPUT).length).toBeGreaterThan(0);
    }
  });

  it('should warn about plaintext in the .env header', () => {
    const text = EXPORT_FORMATTERS.env.build(INPUT) as string;
    expect(text).toContain('Ambiente: Local');
    expect(text).toContain('ADVERTENCIA');
    expect(text).toContain('DATABASE_URL=');
  });
});

describe('exportFilename', () => {
  const generatedAt = new Date('2026-01-15T10:30:00Z');

  it('should slug the environment name and use the format as extension', () => {
    expect(exportFilename('Producción QA', generatedAt, 'json')).toBe(
      'secretvault-produccion-qa-2026-01-15.json',
    );
  });

  it('should fall back to a generic name when nothing usable remains', () => {
    expect(exportFilename('***', generatedAt, 'env')).toBe('secretvault-ambiente-2026-01-15.env');
  });
});
