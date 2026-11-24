export const SORT_ORDERS = ['asc', 'desc', 'manual'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_SORT_ORDER: SortOrder = 'asc';

export function isSortOrder(value: unknown): value is SortOrder {
  return typeof value === 'string' && (SORT_ORDERS as readonly string[]).includes(value);
}

interface Sortable {
  readonly id: number;
  readonly name: string;
  readonly position: number;
}

function compareNames(a: Sortable, b: Sortable): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

const COMPARATORS: Record<SortOrder, (a: Sortable, b: Sortable) => number> = {
  asc: (a, b) => compareNames(a, b),
  desc: (a, b) => compareNames(b, a),
  manual: (a, b) => a.position - b.position,
};

export function sortSecrets<T extends Sortable>(items: readonly T[], order: SortOrder): T[] {
  const compare = COMPARATORS[order];
  return [...items].sort((a, b) => compare(a, b) || a.id - b.id);
}

export function moveId(ids: readonly number[], id: number, targetIndex: number): number[] {
  const rest = ids.filter((other) => other !== id);
  rest.splice(Math.max(0, Math.min(targetIndex, rest.length)), 0, id);
  return rest;
}

export function shiftId(ids: readonly number[], id: number, delta: number): number[] {
  return moveId(ids, id, ids.indexOf(id) + delta);
}
