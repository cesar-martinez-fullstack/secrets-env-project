/**
 * Validaciones de entrada compartidas. Sin dependencias: se usan tanto en el
 * backend (casos de uso) como potencialmente en el frontend (feedback en vivo).
 */
import {
  MASTER_PASSWORD_MAX,
  MASTER_PASSWORD_MIN,
  MAX_ENVIRONMENT_NAME_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_SECRET_NAME_LENGTH,
  MAX_SECRET_NOTE_LENGTH,
  MAX_SECRET_VALUE_LENGTH,
  SECRET_NAME_PATTERN,
} from './constants';

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Contraseña maestra: longitud razonable. El cifrado lo hace el KDF (PBKDF2). */
export function validateMasterPassword(password: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (password.length < MASTER_PASSWORD_MIN) {
    issues.push({
      field: 'masterPassword',
      message: `Debe tener al menos ${MASTER_PASSWORD_MIN} caracteres.`,
    });
  }
  if (password.length > MASTER_PASSWORD_MAX) {
    issues.push({
      field: 'masterPassword',
      message: `No puede exceder ${MASTER_PASSWORD_MAX} caracteres.`,
    });
  }
  return issues;
}

/** Fuerza aproximada de una contraseña (0–4). Usada por el frontend para feedback visual. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

export function validateSecretName(name: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    issues.push({ field: 'name', message: 'El nombre es obligatorio.' });
    return issues;
  }
  if (trimmed.length > MAX_SECRET_NAME_LENGTH) {
    issues.push({ field: 'name', message: `Máximo ${MAX_SECRET_NAME_LENGTH} caracteres.` });
  }
  if (!SECRET_NAME_PATTERN.test(trimmed)) {
    issues.push({
      field: 'name',
      message: 'Usa letras, dígitos, guiones o puntos; debe iniciar con letra o guion bajo.',
    });
  }
  return issues;
}

export function validateSecretValue(value: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (value.length === 0) {
    issues.push({ field: 'value', message: 'El valor es obligatorio.' });
  }
  if (value.length > MAX_SECRET_VALUE_LENGTH) {
    issues.push({ field: 'value', message: `Máximo ${MAX_SECRET_VALUE_LENGTH} caracteres.` });
  }
  return issues;
}

export function validateSecretNote(note: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (note.length > MAX_SECRET_NOTE_LENGTH) {
    issues.push({ field: 'note', message: `Máximo ${MAX_SECRET_NOTE_LENGTH} caracteres.` });
  }
  return issues;
}

const CONTROL_CHARACTERS = /\p{Cc}/u;

const CONTROL_CHARACTERS_MESSAGE = 'No puede contener saltos de línea ni caracteres de control.';

export function validateEnvironmentName(name: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    issues.push({ field: 'name', message: 'El nombre del ambiente es obligatorio.' });
    return issues;
  }
  if (trimmed.length > MAX_ENVIRONMENT_NAME_LENGTH) {
    issues.push({ field: 'name', message: `Máximo ${MAX_ENVIRONMENT_NAME_LENGTH} caracteres.` });
  }
  if (CONTROL_CHARACTERS.test(trimmed)) {
    issues.push({ field: 'name', message: CONTROL_CHARACTERS_MESSAGE });
  }
  return issues;
}

export function validateProjectName(name: string): ValidationIssue[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return [{ field: 'name', message: 'El nombre del proyecto es obligatorio.' }];
  }
  if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
    return [{ field: 'name', message: `Máximo ${MAX_PROJECT_NAME_LENGTH} caracteres.` }];
  }
  if (CONTROL_CHARACTERS.test(trimmed)) {
    return [{ field: 'name', message: CONTROL_CHARACTERS_MESSAGE }];
  }
  return [];
}

/** Normaliza un nombre para comparar duplicados (trim + casefold simple). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
