/**
 * Tests del parser/serializador .env compartido entre backend y frontend.
 */
import { describe, expect, it } from 'bun:test';
import { parseEnvContent, stringifyEnv } from '../src/parse-env';

describe('parseEnvContent', () => {
  it('should parse simple KEY=VALUE lines', () => {
    const result = parseEnvContent('DATABASE_URL=postgres://x\nDEBUG=true');
    expect(result.entries).toEqual([
      { name: 'DATABASE_URL', value: 'postgres://x' },
      { name: 'DEBUG', value: 'true' },
    ]);
    expect(result.invalidLines).toBe(0);
  });

  it('should skip comments and blank lines', () => {
    const result = parseEnvContent('# comentario\n\n  # otro comentario\nKEY=value\n');
    expect(result.entries).toEqual([{ name: 'KEY', value: 'value' }]);
    expect(result.invalidLines).toBe(0);
  });

  it('should support the `export` prefix', () => {
    const result = parseEnvContent('export TOKEN=abc123');
    expect(result.entries).toEqual([{ name: 'TOKEN', value: 'abc123' }]);
  });

  it('should strip surrounding quotes (single and double)', () => {
    const result = parseEnvContent(`A="valor con espacios"\nB='simple'\nC=sin_comillas`);
    expect(result.entries[0]).toEqual({ name: 'A', value: 'valor con espacios' });
    expect(result.entries[1]).toEqual({ name: 'B', value: 'simple' });
    expect(result.entries[2]).toEqual({ name: 'C', value: 'sin_comillas' });
  });

  it('should preserve values containing = signs', () => {
    const result = parseEnvContent('CONNECTION=user=me;password=secret');
    expect(result.entries[0]).toEqual({ name: 'CONNECTION', value: 'user=me;password=secret' });
  });

  it('should keep empty values', () => {
    const result = parseEnvContent('EMPTY=');
    expect(result.entries).toEqual([{ name: 'EMPTY', value: '' }]);
  });

  it('should count invalid lines without throwing', () => {
    const result = parseEnvContent('SIN_IGUALDAD\n=VALOR_AL_PRINCIPIO\n1MAL=valor\nOK=bien');
    expect(result.entries).toEqual([{ name: 'OK', value: 'bien' }]);
    expect(result.invalidLines).toBe(3);
  });

  it('should apply last-wins for duplicates and count them', () => {
    const result = parseEnvContent('KEY=primero\nKEY=segundo');
    expect(result.entries).toEqual([{ name: 'KEY', value: 'segundo' }]);
    expect(result.duplicates).toBe(1);
  });

  it('should handle CRLF line endings', () => {
    const result = parseEnvContent('A=1\r\nB=2\r\n');
    expect(result.entries.length).toBe(2);
  });

  it('should never execute or interpret hostile content (injection-safe parser)', () => {
    const hostile = `X=$(rm -rf /)\nY=\`cmd\`\nZ="; DROP TABLE secrets; --"\nW='$(whoami)'`;
    const result = parseEnvContent(hostile);
    expect(result.entries.map((e) => e.value)).toEqual([
      '$(rm -rf /)',
      '`cmd`',
      '; DROP TABLE secrets; --',
      '$(whoami)',
    ]);
  });
});

describe('stringifyEnv', () => {
  it('should produce a round-trippable .env body', () => {
    const entries = [
      { name: 'DATABASE_URL', value: 'postgres://u:p@h:5432/db' },
      { name: 'QUOTED', value: 'con # y = dentro' },
    ];
    const text = stringifyEnv(entries);
    expect(parseEnvContent(text).entries).toEqual(entries);
  });

  it('should quote values that need it and leave plain ones bare', () => {
    const text = stringifyEnv([
      { name: 'A', value: 'plain' },
      { name: 'B', value: 'with #hash' },
    ]);
    expect(text).toContain('A=plain');
    expect(text).toContain('B="with #hash"');
  });

  it('should emit the header as comments', () => {
    const text = stringifyEnv([{ name: 'A', value: '1' }], { header: 'SecretVault\nlínea 2' });
    expect(text.startsWith('# SecretVault\n# línea 2\n\nA=1')).toBe(true);
  });
});
