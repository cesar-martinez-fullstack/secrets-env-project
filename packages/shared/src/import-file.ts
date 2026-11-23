import { MAX_SECRET_NOTE_LENGTH } from './constants';
import { parseEnvContent } from './parse-env';
import { validateSecretName, validateSecretValue } from './validation';

export interface ImportEntry {
  name: string;
  value: string;
  note: string | null;
}

export type ImportFileFormat = 'env' | 'csv' | 'json';

export interface ParsedImportFile {
  format: ImportFileFormat;
  entries: ImportEntry[];
  invalid: number;
  duplicates: number;
  unreadable: boolean;
}

export function detectImportFormat(fileName: string): ImportFileFormat {
  const extension = fileName.toLowerCase().split('.').at(-1);
  if (extension === 'csv') return 'csv';
  if (extension === 'json') return 'json';
  return 'env';
}

export function isValidImportEntry(entry: ImportEntry): boolean {
  return (
    validateSecretName(entry.name).length === 0 &&
    validateSecretValue(entry.value).length === 0 &&
    (entry.note?.length ?? 0) <= MAX_SECRET_NOTE_LENGTH
  );
}

interface RawEntry {
  name: string;
  value: string;
  note: string | null;
}

/** Valida y deduplica (la última definición gana). */
function collect(
  format: ImportFileFormat,
  raws: readonly RawEntry[],
  extraInvalid = 0,
): ParsedImportFile {
  const byName = new Map<string, ImportEntry>();
  let invalid = extraInvalid;
  let duplicates = 0;
  for (const raw of raws) {
    const entry: ImportEntry = { name: raw.name.trim(), value: raw.value, note: raw.note };
    if (!isValidImportEntry(entry)) {
      invalid++;
      continue;
    }
    if (byName.has(entry.name)) duplicates++;
    byName.set(entry.name, entry);
  }
  return { format, entries: [...byName.values()], invalid, duplicates, unreadable: false };
}

const UNREADABLE = (format: ImportFileFormat): ParsedImportFile => ({
  format,
  entries: [],
  invalid: 0,
  duplicates: 0,
  unreadable: true,
});

interface FieldRead {
  value: string;
  next: number;
}

function readQuotedField(source: string, start: number): FieldRead {
  let value = '';
  let index = start + 1;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === '"' && source.charAt(index + 1) === '"') {
      value += '"';
      index += 2;
    } else if (char === '"') {
      index++;
      break;
    } else {
      value += char;
      index++;
    }
  }
  return { value, next: index };
}

function readPlainField(source: string, start: number): FieldRead {
  const end = source.slice(start).search(/[,\r\n]/);
  const next = end < 0 ? source.length : start + end;
  return { value: source.slice(start, next), next };
}

/** Filas de un CSV (RFC 4180): comillas dobles, `""` escapado y saltos de línea dentro de comillas. */
export function parseCsvRows(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;
  while (index < source.length) {
    const { value, next } =
      source.charAt(index) === '"' ? readQuotedField(source, index) : readPlainField(source, index);
    row.push(value);
    index = next;
    if (source.charAt(index) === ',') {
      index++;
      if (index < source.length) continue;
      row.push('');
    } else if (source.startsWith('\r\n', index)) {
      index++;
    }
    index++;
    rows.push(row);
    row = [];
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function parseCsv(text: string): ParsedImportFile {
  const [header, ...rows] = parseCsvRows(text);
  const columns = (header ?? []).map((cell) => cell.trim().toLowerCase());
  const nameAt = columns.indexOf('name');
  const valueAt = columns.indexOf('value');
  if (nameAt < 0 || valueAt < 0) return UNREADABLE('csv');
  const noteAt = columns.indexOf('note');

  return collect(
    'csv',
    rows.map((cells) => ({
      name: cells[nameAt] ?? '',
      value: cells[valueAt] ?? '',
      note: noteAt < 0 ? null : normalizeNote(cells[noteAt]),
    })),
  );
}

function normalizeNote(note: unknown): string | null {
  return typeof note === 'string' && note.trim().length > 0 ? note.trim() : null;
}

function asRawEntry(item: unknown): RawEntry | null {
  if (typeof item !== 'object' || item === null) return null;
  const { name, value, note } = item as Record<string, unknown>;
  if (typeof name !== 'string' || typeof value !== 'string') return null;
  return { name, value, note: normalizeNote(note) };
}

function parseJson(text: string): ParsedImportFile {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return UNREADABLE('json');
  }
  const list = Array.isArray(document) ? document : (document as { secrets?: unknown })?.secrets;
  if (!Array.isArray(list)) return UNREADABLE('json');

  const raws = list.map(asRawEntry);
  const entries = raws.filter((raw): raw is RawEntry => raw !== null);
  return collect('json', entries, raws.length - entries.length);
}

function parseEnv(text: string): ParsedImportFile {
  const parsed = parseEnvContent(text);
  const result = collect(
    'env',
    parsed.entries.map(({ name, value }) => ({ name, value, note: null })),
    parsed.invalidLines,
  );
  return { ...result, duplicates: result.duplicates + parsed.duplicates };
}

const PARSERS: Record<ImportFileFormat, (text: string) => ParsedImportFile> = {
  env: parseEnv,
  csv: parseCsv,
  json: parseJson,
};

/** Lee un archivo de importación; el formato sale de la extensión (cualquier otra cosa es `.env`). */
export function parseImportFile(fileName: string, text: string): ParsedImportFile {
  return PARSERS[detectImportFormat(fileName)](text);
}
