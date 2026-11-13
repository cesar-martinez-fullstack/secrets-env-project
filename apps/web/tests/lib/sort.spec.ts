import { describe, expect, it } from 'bun:test';
import { isSortOrder, moveId, shiftId, sortSecrets } from '@/lib/sort';

const items = [
  { id: 1, name: 'beta', position: 2 },
  { id: 2, name: 'Alfa', position: 0 },
  { id: 3, name: 'GAMMA', position: 1 },
  { id: 4, name: 'alfa', position: 3 },
];

const ids = (order: 'asc' | 'desc' | 'manual') => sortSecrets(items, order).map((item) => item.id);

describe('sortSecrets', () => {
  it('should sort A to Z ignoring case, with the id as tie-breaker', () => {
    expect(ids('asc')).toEqual([2, 4, 1, 3]);
  });

  it('should sort Z to A ignoring case, keeping the id tie-breaker ascending', () => {
    expect(ids('desc')).toEqual([3, 1, 2, 4]);
  });

  it('should follow the stored position in manual order', () => {
    expect(ids('manual')).toEqual([2, 3, 1, 4]);
  });

  it('should not mutate the original list', () => {
    const copy = [...items];

    sortSecrets(items, 'desc');

    expect(items).toEqual(copy);
  });
});

describe('sort order helpers', () => {
  it('should recognize only the known orders', () => {
    expect(isSortOrder('asc')).toBe(true);
    expect(isSortOrder('manual')).toBe(true);
    expect(isSortOrder('random')).toBe(false);
    expect(isSortOrder(null)).toBe(false);
  });
});

describe('moving ids', () => {
  it('should move an id to a target index', () => {
    expect(moveId([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4]);
    expect(moveId([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3]);
  });

  it('should keep the id inside the list when the target is out of range', () => {
    expect(moveId([1, 2, 3], 1, 99)).toEqual([2, 3, 1]);
    expect(moveId([1, 2, 3], 3, -5)).toEqual([3, 1, 2]);
  });

  it('should shift an id one place up or down and stay put at the edges', () => {
    expect(shiftId([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(shiftId([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(shiftId([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(shiftId([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
});
