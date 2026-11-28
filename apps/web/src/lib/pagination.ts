import type { SortOrder } from '@/lib/sort';

export const PAGE_SIZE = 50;

/** El orden manual necesita la lista entera para poder arrastrar y guardar todas las posiciones. */
export function isPaged(order: SortOrder, searching: boolean): boolean {
  return searching || order !== 'manual';
}

export function lastPage(total: number): number {
  return Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
}

export function pageRange(
  page: number,
  shown: number,
  total: number,
): { from: number; to: number } {
  const from = page * PAGE_SIZE + 1;
  return { from, to: Math.min(from + shown - 1, total) };
}
