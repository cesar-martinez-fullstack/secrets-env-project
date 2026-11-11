import type { ValidationIssue } from './validation';

export const ACCENTS = ['indigo', 'blue', 'teal', 'emerald', 'violet', 'rose', 'orange'] as const;
export type Accent = (typeof ACCENTS)[number];

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const APP_NAME_MAX_LENGTH = 40;

export interface Appearance {
  appName: string;
  accent: Accent;
  defaultTheme: ThemeMode;
}

export const DEFAULT_APPEARANCE: Appearance = {
  appName: 'SecretVault',
  accent: 'indigo',
  defaultTheme: 'system',
};

export const isAccent = (value: unknown): value is Accent =>
  (ACCENTS as readonly unknown[]).includes(value);

export const isThemeMode = (value: unknown): value is ThemeMode =>
  (THEME_MODES as readonly unknown[]).includes(value);

/** El nombre se muestra en la pantalla de entrada: sin saltos de línea ni caracteres de control. */
export function isValidAppName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= APP_NAME_MAX_LENGTH && !/\p{Cc}/u.test(trimmed);
}

export function validateAppearance(input: {
  appName: unknown;
  accent: unknown;
  defaultTheme: unknown;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof input.appName !== 'string' || !isValidAppName(input.appName)) {
    issues.push({
      field: 'appName',
      message: `Entre 1 y ${APP_NAME_MAX_LENGTH} caracteres, sin saltos de línea ni de control.`,
    });
  }
  if (!isAccent(input.accent)) issues.push({ field: 'accent', message: 'Color no permitido.' });
  if (!isThemeMode(input.defaultTheme)) {
    issues.push({ field: 'defaultTheme', message: 'Tema no permitido.' });
  }
  return issues;
}
