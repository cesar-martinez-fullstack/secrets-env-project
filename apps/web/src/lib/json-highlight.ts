export type JsonTokenKind = 'key' | 'string' | 'number' | 'literal' | 'punctuation' | 'space';

export interface JsonToken {
  text: string;
  kind: JsonTokenKind;
}

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)/g;

/** Formatea con sangría de 2 espacios; `null` si el texto no es JSON válido. */
export function formatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

export function looksLikeJson(text: string): boolean {
  return /^\s*[{[]/.test(text);
}

/** Divide un JSON ya formateado en fragmentos con su tipo, para pintarlos sin usar HTML. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const [whole, string, colon, number, literal, punctuation] = match;
    if (string !== undefined && colon !== undefined) {
      tokens.push({ text: string, kind: 'key' }, { text: colon, kind: 'punctuation' });
    } else if (string !== undefined) {
      tokens.push({ text: string, kind: 'string' });
    } else if (number !== undefined) {
      tokens.push({ text: number, kind: 'number' });
    } else if (literal !== undefined) {
      tokens.push({ text: literal, kind: 'literal' });
    } else {
      tokens.push({ text: whole, kind: punctuation !== undefined ? 'punctuation' : 'space' });
    }
  }
  return tokens;
}
