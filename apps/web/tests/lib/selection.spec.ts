import { describe, expect, it } from 'bun:test';
import { pruneSelection, summarizeNames, toggleAllIds, toggleId } from '@/lib/selection';

describe('selection', () => {
  it('should add and remove an id without mutating the original set', () => {
    const original = new Set([1]);

    const added = toggleId(original, 2);
    const removed = toggleId(added, 1);

    expect([...original]).toEqual([1]);
    expect([...added]).toEqual([1, 2]);
    expect([...removed]).toEqual([2]);
  });

  it('should select every id and clear when all are already selected', () => {
    expect([...toggleAllIds(new Set([1]), [1, 2, 3])]).toEqual([1, 2, 3]);
    expect(toggleAllIds(new Set([1, 2, 3]), [1, 2, 3]).size).toBe(0);
    expect(toggleAllIds(new Set(), []).size).toBe(0);
  });

  it('should drop the ids that are no longer listed', () => {
    expect([...pruneSelection(new Set([1, 2, 3]), [2, 3, 4])]).toEqual([2, 3]);
  });

  it('should list up to ten names and count the rest', () => {
    const names = Array.from({ length: 12 }, (_, index) => `K${index + 1}`);

    expect(summarizeNames(['A', 'B'], (n) => `+${n}`)).toBe('A, B');
    expect(summarizeNames(names, (n) => `y ${n} más`)).toEndWith('K10 y 2 más');
  });
});
