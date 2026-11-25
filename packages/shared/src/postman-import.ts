/** Lectura de archivos de Postman: Environment, Globals y variables de una colección v2. */

export type PostmanKind = 'environment' | 'globals' | 'collection';

export interface PostmanVariable {
  name: string;
  value: string;
  disabled: boolean;
}

export interface PostmanDocument {
  kind: PostmanKind;
  name: string | null;
  variables: PostmanVariable[];
  /** Elementos sin clave o con un valor que no es texto, número ni booleano. */
  malformed: number;
}

const COLLECTION_SCHEMA = /\/\/schema\.(get)?postman\.com\/.*collection\/v2/;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

function asValueText(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : null;
}

function asVariable(item: unknown): PostmanVariable | null {
  const record = asRecord(item);
  const value = record ? asValueText(record.value) : null;
  if (!record || typeof record.key !== 'string' || value === null) return null;
  return {
    name: record.key,
    value,
    disabled: record.enabled === false || record.disabled === true,
  };
}

function toDocument(kind: PostmanKind, name: unknown, items: unknown[]): PostmanDocument {
  const variables = items.map(asVariable).filter((item): item is PostmanVariable => item !== null);
  return { kind, name: textOrNull(name), variables, malformed: items.length - variables.length };
}

function readCollection(document: Record<string, unknown>): PostmanDocument | null {
  const info = asRecord(document.info);
  if (typeof info?.schema !== 'string' || !COLLECTION_SCHEMA.test(info.schema)) return null;
  return toDocument(
    'collection',
    info.name,
    Array.isArray(document.variable) ? document.variable : [],
  );
}

/** Exportaciones antiguas no llevan `_postman_variable_scope`: se reconocen por su forma. */
function looksLikeVariableList(document: Record<string, unknown>, values: unknown[]): boolean {
  const scope = document._postman_variable_scope;
  if (scope === 'environment' || scope === 'globals') return true;
  return (
    typeof document.name === 'string' && values.every((item) => asRecord(item)?.key !== undefined)
  );
}

function readVariableList(document: Record<string, unknown>): PostmanDocument | null {
  const { values } = document;
  if (!Array.isArray(values) || !looksLikeVariableList(document, values)) return null;
  const kind = document._postman_variable_scope === 'globals' ? 'globals' : 'environment';
  return toDocument(kind, document.name, values);
}

/** `null` si el JSON no es un archivo de Postman reconocido. */
export function readPostmanDocument(json: unknown): PostmanDocument | null {
  const document = asRecord(json);
  return document ? (readCollection(document) ?? readVariableList(document)) : null;
}
