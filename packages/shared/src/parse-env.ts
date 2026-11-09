/**
 * Parser y serializador de archivos .env — formato dotenv clásico.
 * Soporta: comentarios (#), prefijo `export`, comillas simples/dobles y
 * espacios alrededor del `=`. Se usa en la importación masiva y exportación.
 */

export interface ParsedEnvEntry {
  name: string;
  value: string;
}

export interface ParseEnvResult {
  entries: ParsedEnvEntry[];
  invalidLines: number;
  duplicates: number;
}

export function parseEnvContent(content: string): ParseEnvResult {
  const result: ParseEnvResult = { entries: [], invalidLines: 0, duplicates: 0 };
  const seen = new Map<string, number>();

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    // Prefijo opcional `export `
    if (/^export\s+/.test(line)) {
      line = line.replace(/^export\s+/, '');
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      result.invalidLines++;
      continue;
    }

    const name = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Comillas envolventes
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
      result.invalidLines++;
      continue;
    }

    if (seen.has(name)) {
      // dotenv: la última definición gana
      result.duplicates++;
      const index = seen.get(name)!;
      result.entries[index] = { name, value };
    } else {
      seen.set(name, result.entries.length);
      result.entries.push({ name, value });
    }
  }

  return result;
}

export interface StringifyEnvOptions {
  header?: string;
}

export function stringifyEnv(entries: ParsedEnvEntry[], options: StringifyEnvOptions = {}): string {
  const parts: string[] = [];
  if (options.header) {
    for (const line of options.header.split('\n')) {
      parts.push(`# ${line}`);
    }
    parts.push('');
  }
  for (const entry of entries) {
    parts.push(`${entry.name}=${formatEnvValue(entry.value)}`);
  }
  return parts.join('\n') + '\n';
}

function formatEnvValue(value: string): string {
  // Solo citamos cuando es necesario para que el round-trip sea fiel.
  if (value.length === 0) return '';
  if (/^\s|\s$|[#'"\n\r=]/.test(value)) {
    return `"${value.replace(/([\\"])/g, '\\$1')}"`;
  }
  return value;
}
