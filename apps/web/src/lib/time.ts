import type { Locale } from '@/i18n/translate';

type Unit = readonly [Intl.RelativeTimeFormatUnit, number];

const SECOND: Unit = ['second', 1];
const LARGER_UNITS: readonly Unit[] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

export function relativeTime(iso: string, locale: Locale = 'es'): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const [unit, seconds] = LARGER_UNITS.find(([, size]) => abs >= size) ?? SECOND;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    Math.round(diffSeconds / seconds),
    unit,
  );
}

export function absoluteTime(iso: string, locale: Locale = 'es'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
