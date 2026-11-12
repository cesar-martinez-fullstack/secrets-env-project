import { describe, expect, it } from 'bun:test';
import { isSortOrder, oppositeOrder, sortByName } from '@/lib/sort';

const items = [
  { id: 1, name: 'beta' },
  { id: 2, name: 'Alfa' },
  { id: 3, name: 'GAMMA' },
  { id: 4, name: 'alfa' },
];

describe('sortByName', () => {
  it('should sort A to Z ignoring case, with the id as tie-breaker', () => {
    expect(sortByName(items, 'asc').map((item) => item.id)).toEqual([2, 4, 1, 3]);
  });

  it('should sort Z to A ignoring case, keeping the id tie-breaker ascending', () => {
    expect(sortByName(items, 'desc').map((item) => item.id)).toEqual([3, 1, 2, 4]);
  });

  it('should not mutate the original list', () => {
    const copy = [...items];

    sortByName(items, 'desc');

    expect(items).toEqual(copy);
  });
});

describe('sort order helpers', () => {
  it('should recognize only the known orders', () => {
    expect(isSortOrder('asc')).toBe(true);
    expect(isSortOrder('desc')).toBe(true);
    expect(isSortOrder('manual')).toBe(false);
    expect(isSortOrder(null)).toBe(false);
  });

  it('should flip the order', () => {
    expect(oppositeOrder('asc')).toBe('desc');
    expect(oppositeOrder('desc')).toBe('asc');
  });
});
