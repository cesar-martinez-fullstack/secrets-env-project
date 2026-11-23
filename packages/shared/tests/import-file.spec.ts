import { describe, expect, it } from 'bun:test';
import { detectImportFormat, parseCsvRows, parseImportFile } from '../src/import-file';

describe('detectImportFormat', () => {
  it('should pick the format from the extension and default to env', () => {
    expect(detectImportFormat('datos.CSV')).toBe('csv');
    expect(detectImportFormat('secretvault-local.json')).toBe('json');
    expect(detectImportFormat('.env')).toBe('env');
    expect(detectImportFormat('notas.txt')).toBe('env');
    expect(detectImportFormat('sin-extension')).toBe('env');
  });
});

describe('parseCsvRows', () => {
  it('should handle quotes, escaped quotes, commas and line breaks inside fields', () => {
    const rows = parseCsvRows('a,"con,coma","di ""hola"""\r\nb,"multi\nlinea",\r\n');

    expect(rows).toEqual([
      ['a', 'con,coma', 'di "hola"'],
      ['b', 'multi\nlinea', ''],
    ]);
  });

  it('should strip the BOM and skip blank lines', () => {
    expect(parseCsvRows('﻿a,b\n\n\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('should keep a trailing empty field', () => {
    expect(parseCsvRows('a,b,')).toEqual([['a', 'b', '']]);
  });
});

describe('parseImportFile (csv)', () => {
  it('should read name, value and note columns in any order and case', () => {
    const result = parseImportFile('x.csv', 'Note,Value,NAME\nuna nota,v1,API_KEY\n,v2,OTRA');

    expect(result.entries).toEqual([
      { name: 'API_KEY', value: 'v1', note: 'una nota' },
      { name: 'OTRA', value: 'v2', note: null },
    ]);
  });

  it('should count invalid names and empty values and duplicates', () => {
    const result = parseImportFile('x.csv', 'name,value\nOK,1\n1MAL,2\nVACIO,\nOK,3');

    expect(result.entries).toEqual([{ name: 'OK', value: '3', note: null }]);
    expect(result.invalid).toBe(2);
    expect(result.duplicates).toBe(1);
  });

  it('should flag a file without name and value columns as unreadable', () => {
    expect(parseImportFile('x.csv', 'a,b\n1,2').unreadable).toBe(true);
  });
});

describe('parseImportFile (json)', () => {
  it('should read the document the JSON export produces', () => {
    const document = {
      version: 1,
      secrets: [{ environment: 'Local', name: 'API_KEY', value: 'v', note: 'n' }],
    };

    expect(parseImportFile('x.json', JSON.stringify(document)).entries).toEqual([
      { name: 'API_KEY', value: 'v', note: 'n' },
    ]);
  });

  it('should accept a plain list of name and value objects', () => {
    const result = parseImportFile('x.json', '[{"name":"A","value":"1"},{"name":"B"},5]');

    expect(result.entries).toEqual([{ name: 'A', value: '1', note: null }]);
    expect(result.invalid).toBe(2);
  });

  it('should flag broken or unexpected JSON as unreadable', () => {
    expect(parseImportFile('x.json', '{no es json').unreadable).toBe(true);
    expect(parseImportFile('x.json', '{"otra":"cosa"}').unreadable).toBe(true);
    expect(parseImportFile('x.json', 'null').unreadable).toBe(true);
  });
});

describe('parseImportFile (env)', () => {
  it('should reuse the dotenv parser and report its invalid lines and duplicates', () => {
    const result = parseImportFile('.env', 'A=1\nB=2\nA=3\nmal formada\n');

    expect(result.entries).toEqual([
      { name: 'A', value: '3', note: null },
      { name: 'B', value: '2', note: null },
    ]);
    expect(result.invalid).toBe(1);
    expect(result.duplicates).toBe(1);
  });
});
