import { describe, expect, it } from 'bun:test';
import { isSortOrder, moveId, shiftId } from '@/lib/sort';

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
