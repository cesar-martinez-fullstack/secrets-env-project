import { describe, expect, it } from 'bun:test';
import { formatJson, looksLikeJson, tokenizeJson } from '@/lib/json-highlight';

describe('formatJson', () => {
  it('should indent a minified document with two spaces', () => {
    expect(formatJson('{"a":[1,2],"b":{"c":null}}')).toBe(
      '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}',
    );
  });

  it('should return null for text that is not JSON', () => {
    expect(formatJson('{no es json')).toBeNull();
    expect(formatJson('')).toBeNull();
  });
});

describe('looksLikeJson', () => {
  it('should detect documents that start with an object or an array', () => {
    expect(looksLikeJson('  {"a":1}')).toBe(true);
    expect(looksLikeJson('[1]')).toBe(true);
    expect(looksLikeJson('A=1')).toBe(false);
  });
});

describe('tokenizeJson', () => {
  const kinds = (text: string) =>
    tokenizeJson(text)
      .filter((token) => token.kind !== 'space')
      .map((token) => `${token.kind}:${token.text}`);

  it('should tell keys from string values and classify the other tokens', () => {
    expect(kinds('{"name": "API", "n": -1.5e2, "ok": true, "x": null}')).toEqual([
      'punctuation:{',
      'key:"name"',
      'punctuation::',
      'string:"API"',
      'punctuation:,',
      'key:"n"',
      'punctuation::',
      'number:-1.5e2',
      'punctuation:,',
      'key:"ok"',
      'punctuation::',
      'literal:true',
      'punctuation:,',
      'key:"x"',
      'punctuation::',
      'literal:null',
      'punctuation:}',
    ]);
  });

  it('should keep escaped quotes inside a single string token', () => {
    expect(kinds('["di \\"hola\\""]')).toEqual([
      'punctuation:[',
      'string:"di \\"hola\\""',
      'punctuation:]',
    ]);
  });

  it('should reproduce the original text when the tokens are joined', () => {
    const text = formatJson('{"a":["x",2,false],"b":{"c":"d"}}')!;

    expect(
      tokenizeJson(text)
        .map((token) => token.text)
        .join(''),
    ).toBe(text);
  });
});
