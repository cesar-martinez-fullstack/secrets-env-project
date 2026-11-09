/**
 * Formateo de fechas: relativo ("hace 5 min") y absoluto localizado.
 */
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return rtf.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2_592_000) return rtf.format(Math.round(diffSeconds / 86_400), 'day');
  if (abs < 31_536_000) return rtf.format(Math.round(diffSeconds / 2_592_000), 'month');
  return rtf.format(Math.round(diffSeconds / 31_536_000), 'year');
}

export function absoluteTime(iso: string): string {
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
