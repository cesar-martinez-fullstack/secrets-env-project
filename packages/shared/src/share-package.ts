import type { ValidationIssue } from './validation';

export const SHARE_FORMAT = 'secretvault-share';
export const SHARE_VERSION = 1;
export const SHARE_MIN_PASSPHRASE = 12;
export const SHARE_MIN_ITERATIONS = 100_000;
export const SHARE_MAX_ITERATIONS = 2_000_000;
export const SHARE_MIN_SALT_BYTES = 16;
export const SHARE_FILE_EXTENSION = 'svshare';

export interface ShareSecret {
  name: string;
  value: string;
  note: string | null;
}

export interface ShareEnvironment {
  name: string;
  secrets: ShareSecret[];
}

export interface SharePayload {
  project: string;
  environments: ShareEnvironment[];
}

export interface ShareEnvelope {
  iterations: number;
  salt: Uint8Array;
  data: Uint8Array;
}

const BASE64_CHUNK = 0x8000;

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function validateSharePassphrase(passphrase: string): ValidationIssue[] {
  if (passphrase.length >= SHARE_MIN_PASSPHRASE) return [];
  return [
    {
      field: 'passphrase',
      message: `La frase de paso debe tener al menos ${SHARE_MIN_PASSPHRASE} caracteres.`,
    },
  ];
}

export function serializeShareEnvelope(envelope: ShareEnvelope): string {
  return JSON.stringify({
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    iterations: envelope.iterations,
    salt: encodeBase64(envelope.salt),
    data: encodeBase64(envelope.data),
  });
}

function isInRange(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SHARE_MIN_ITERATIONS &&
    value <= SHARE_MAX_ITERATIONS
  );
}

function decodeField(value: unknown): Uint8Array | null {
  return typeof value === 'string' ? decodeBase64(value) : null;
}

export function parseShareEnvelope(text: string): ShareEnvelope | null {
  const raw = parseJson(text);
  if (!isRecord(raw) || raw.format !== SHARE_FORMAT || raw.version !== SHARE_VERSION) return null;
  const salt = decodeField(raw.salt);
  const data = decodeField(raw.data);
  if (!isInRange(raw.iterations) || !salt || !data) return null;
  if (salt.length < SHARE_MIN_SALT_BYTES) return null;
  return { iterations: raw.iterations, salt, data };
}

export function parseSharePayload(text: string): SharePayload | null {
  const raw = parseJson(text);
  if (!isRecord(raw) || typeof raw.project !== 'string' || !Array.isArray(raw.environments)) {
    return null;
  }
  const environments: ShareEnvironment[] = [];
  for (const entry of raw.environments) {
    const environment = toEnvironment(entry);
    if (!environment) return null;
    environments.push(environment);
  }
  return { project: raw.project, environments };
}

function toSecret(item: unknown): ShareSecret | null {
  if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'string') {
    return null;
  }
  const { note } = item;
  if (note !== undefined && note !== null && typeof note !== 'string') return null;
  return { name: item.name, value: item.value, note: note ?? null };
}

function toEnvironment(entry: unknown): ShareEnvironment | null {
  if (!isRecord(entry) || typeof entry.name !== 'string' || !Array.isArray(entry.secrets)) {
    return null;
  }
  const secrets = entry.secrets.map(toSecret);
  if (secrets.some((secret) => secret === null)) return null;
  return { name: entry.name, secrets: secrets as ShareSecret[] };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
