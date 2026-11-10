import { describe, expect, it } from 'bun:test';
import { EXPORT_FORMATS, isExportFormat } from '../src';

describe('export formats', () => {
  it('should list every supported format, JSON included', () => {
    expect([...EXPORT_FORMATS].sort()).toEqual(['csv', 'env', 'json', 'pdf']);
  });

  it('should recognise only supported formats', () => {
    for (const format of EXPORT_FORMATS) expect(isExportFormat(format)).toBe(true);
    for (const other of ['', 'xml', 'JSON', 'toString', '__proto__']) {
      expect(isExportFormat(other)).toBe(false);
    }
  });
});
