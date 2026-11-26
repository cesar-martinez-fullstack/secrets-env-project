import { describe, expect, it } from 'bun:test';
import { parseImportFile } from '../src/import-file';
import { readPostmanDocument } from '../src/postman-import';

const environment = (values: unknown[], extra: object = {}) =>
  JSON.stringify({
    id: 'uuid',
    name: 'col_dev',
    values,
    color: null,
    _postman_variable_scope: 'environment',
    ...extra,
  });

const variable = (key: string, value: unknown, extra: object = {}) => ({
  key,
  value,
  type: 'default',
  enabled: true,
  ...extra,
});

describe('readPostmanDocument', () => {
  it('should recognise environments, globals and v2.1 collections', () => {
    const collection = {
      info: {
        name: 'Mi API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      variable: [{ key: 'base_url', value: 'http://localhost' }],
    };

    expect(readPostmanDocument(JSON.parse(environment([])))?.kind).toBe('environment');
    expect(
      readPostmanDocument({ name: 'Globals', values: [], _postman_variable_scope: 'globals' })
        ?.kind,
    ).toBe('globals');
    expect(readPostmanDocument(collection)).toMatchObject({ kind: 'collection', name: 'Mi API' });
  });

  it('should accept old environment exports without the scope field', () => {
    const old = { name: 'viejo', values: [{ key: 'A', value: '1' }] };

    expect(readPostmanDocument(old)?.kind).toBe('environment');
  });

  it('should ignore JSON that is not from Postman', () => {
    for (const other of [
      null,
      [],
      'texto',
      { secrets: [] },
      { values: [1, 2], name: 'x' },
      { values: [{ key: 'A' }] },
      { info: { schema: 'https://example.com/otro.json' } },
    ]) {
      expect(readPostmanDocument(other)).toBeNull();
    }
  });
});

describe('parseImportFile with Postman files', () => {
  it('should import the variables that have a value and report the source', () => {
    const result = parseImportFile(
      'x.postman_environment.json',
      environment([
        variable('API_URL', 'http://localhost'),
        variable('TOKEN', 'abc', { type: 'secret' }),
      ]),
    );

    expect(result.entries).toEqual([
      { name: 'API_URL', value: 'http://localhost', note: null },
      { name: 'TOKEN', value: 'abc', note: null },
    ]);
    expect(result.postman).toEqual({
      kind: 'environment',
      name: 'col_dev',
      skippedEmpty: 0,
      skippedDisabled: 0,
    });
  });

  it('should skip empty and disabled variables and count each reason apart', () => {
    const result = parseImportFile(
      'x.json',
      environment([
        variable('VACIA', ''),
        variable('SIN_VALOR', undefined),
        variable('NULA', null),
        variable('APAGADA', 'v', { enabled: false }),
        variable('BUENA', 'v'),
      ]),
    );

    expect(result.entries.map((entry) => entry.name)).toEqual(['BUENA']);
    expect(result.postman).toMatchObject({ skippedEmpty: 3, skippedDisabled: 1 });
    expect(result.invalid).toBe(0);
  });

  it('should turn numbers and booleans into text and count unusable variables as invalid', () => {
    const result = parseImportFile(
      'x.json',
      environment([
        variable('PUERTO', 8080),
        variable('ACTIVO', false),
        variable('OBJETO', { a: 1 }),
        variable('con espacios', 'v'),
        { value: 'sin clave' },
      ]),
    );

    expect(result.entries.map((entry) => [entry.name, entry.value])).toEqual([
      ['PUERTO', '8080'],
      ['ACTIVO', 'false'],
    ]);
    expect(result.invalid).toBe(3);
  });

  it('should read collection variables, where disabled uses its own flag', () => {
    const collection = JSON.stringify({
      info: {
        name: 'Mi API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [],
      variable: [
        { key: 'base_url', value: 'http://localhost' },
        { key: 'viejo', value: 'x', disabled: true },
      ],
    });

    const result = parseImportFile('api.postman_collection.json', collection);

    expect(result.entries.map((entry) => entry.name)).toEqual(['base_url']);
    expect(result.postman).toMatchObject({ kind: 'collection', skippedDisabled: 1 });
  });

  it('should leave the other JSON formats without Postman information', () => {
    const own = parseImportFile('x.json', '{"secrets":[{"name":"A","value":"1"}]}');

    expect(own.postman).toBeNull();
    expect(own.entries).toHaveLength(1);
  });
});
