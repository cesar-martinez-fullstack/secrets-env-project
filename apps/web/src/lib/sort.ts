export const SORT_ORDERS = ['asc', 'desc'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_SORT_ORDER: SortOrder = 'asc';

export function isSortOrder(value: unknown): value is SortOrder {
  return typeof value === 'string' && (SORT_ORDERS as readonly string[]).includes(value);
}

export function oppositeOrder(order: SortOrder): SortOrder {
  return order === 'asc' ? 'desc' : 'asc';
}

export function sortByName<T extends { readonly id: number; readonly name: string }>(
  items: readonly T[],
  order: SortOrder,
): T[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...items].sort(
    (a, b) =>
      direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id,
  );
}
