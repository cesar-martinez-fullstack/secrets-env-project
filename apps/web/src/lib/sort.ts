import type { SortOrder } from '@secretvault/shared';

export { SORT_ORDERS, isSortOrder, type SortOrder } from '@secretvault/shared';

export const DEFAULT_SORT_ORDER: SortOrder = 'asc';

export function moveId(ids: readonly number[], id: number, targetIndex: number): number[] {
  const rest = ids.filter((other) => other !== id);
  rest.splice(Math.max(0, Math.min(targetIndex, rest.length)), 0, id);
  return rest;
}

export function shiftId(ids: readonly number[], id: number, delta: number): number[] {
  return moveId(ids, id, ids.indexOf(id) + delta);
}
