/**
 * Utilidades HTTP: respuestas JSON (no-cache), cookies de sesión y lectura
 * validada del body.
 */
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  SESSION_COOKIE,
  isExportFormat,
  type ExportFormat,
  type ImportEntry,
} from '@secretvault/shared';
import { DomainError, ValidationFailedError, type VaultSession } from '@secretvault/core';
import type { ApiConfig } from '../config';

/** Respuesta JSON estándar (nunca cacheable: datos sensibles). */
export function jsonResponse<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json(data, status, { 'Cache-Control': 'no-store' });
}

export function sessionCookieOptions(config: ApiConfig, expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    path: '/',
    secure: config.cookieSecure,
    // La cookie dura lo mismo que le queda a la sesión.
    maxAge: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function setSessionCookie(c: Context, session: VaultSession, config: ApiConfig): void {
  setCookie(c, SESSION_COOKIE, session.sessionId, sessionCookieOptions(config, session.expiresAt));
}

export function getSessionId(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Lee el body JSON validando que sea un objeto plano. */
export async function readJsonBody<T extends object>(c: Context): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw invalidBody();
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidBody();
  }
  return body as T;
}

function invalidBody(): ValidationFailedError {
  return new ValidationFailedError([{ field: 'body', message: 'JSON inválido o vacío.' }]);
}

/** Exige un campo string en el body. */
export function requireString(body: object, field: string): string {
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== 'string') {
    throw new ValidationFailedError([{ field, message: 'Campo requerido y debe ser texto.' }]);
  }
  return value;
}

/** Exige un campo entero en el body. */
export function requireInt(body: object, field: string): number {
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationFailedError([{ field, message: 'Campo requerido y debe ser entero.' }]);
  }
  return value;
}

/** Campo entero opcional: ausente o `null` valen `null`. */
export function optionalInt(body: object, field: string): number | null {
  const value = (body as Record<string, unknown>)[field];
  return value === undefined || value === null ? null : requireInt(body, field);
}

/** Exige un campo booleano en el body. */
export function requireBoolean(body: object, field: string): boolean {
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== 'boolean') {
    throw new ValidationFailedError([{ field, message: 'Campo requerido y debe ser booleano.' }]);
  }
  return value;
}

/** Exige una lista de textos en el body. */
export function requireStringList(body: object, field: string): string[] {
  const value = (body as Record<string, unknown>)[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new ValidationFailedError([{ field, message: 'Debe ser una lista de textos.' }]);
  }
  return value;
}

/** Exige una lista de entradas de importación `{ name, value, note? }`. */
export function requireImportEntries(body: object, field: string): ImportEntry[] {
  const value = (body as Record<string, unknown>)[field];
  const entries = Array.isArray(value) ? value.map(toImportEntry) : null;
  if (entries === null || entries.includes(null)) {
    throw new ValidationFailedError([{ field, message: 'Debe ser una lista de entradas.' }]);
  }
  return entries as ImportEntry[];
}

function toImportEntry(item: unknown): ImportEntry | null {
  if (typeof item !== 'object' || item === null) return null;
  const { name, value, note } = item as Record<string, unknown>;
  if (typeof name !== 'string' || typeof value !== 'string') return null;
  return { name, value, note: typeof note === 'string' ? note : null };
}

/** Exige una lista de enteros positivos en el body. */
export function requireIdList(body: object, field: string): number[] {
  const value = (body as Record<string, unknown>)[field];
  const valid =
    Array.isArray(value) && value.every((item) => Number.isInteger(item) && (item as number) > 0);
  if (!valid) {
    throw new ValidationFailedError([{ field, message: 'Debe ser una lista de identificadores.' }]);
  }
  return value as number[];
}

/** Lista de ids separados por comas en un query param (`?ids=1,2,3`). */
export function parseIdListParam(raw: string): number[] {
  const ids = raw.split(',').map((part) => (/^\d{1,9}$/.test(part) ? Number(part) : 0));
  if (ids.length === 0 || ids.length > 1000 || ids.includes(0)) {
    throw new ValidationFailedError([
      { field: 'ids', message: 'Lista de identificadores inválida.' },
    ]);
  }
  return ids;
}

/** Convierte y valida un :id de ruta. */
export function parseIdParam(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationFailedError([{ field: 'id', message: 'Identificador inválido.' }]);
  }
  return id;
}

export function parseExportFormat(raw: string): ExportFormat {
  if (!isExportFormat(raw)) {
    throw new ValidationFailedError([{ field: 'format', message: 'Formato inválido.' }]);
  }
  return raw;
}

export function rateLimited(retryAfterSeconds: number): DomainError {
  return new DomainError(
    'RATE_LIMITED',
    `Demasiados intentos. Espera ${retryAfterSeconds}s antes de reintentar.`,
    429,
  );
}
