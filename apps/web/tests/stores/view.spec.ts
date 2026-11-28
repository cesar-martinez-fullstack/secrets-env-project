import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { VIEW_MODES, isViewMode } from '@/lib/view-mode';
import { useViewStore } from '@/stores/view';

const globals = globalThis as unknown as Record<string, unknown>;

function stubStorage(saved: Record<string, string> = {}): Record<string, string> {
  globals.localStorage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => {
      saved[key] = value;
    },
  };
  return saved;
}

describe('view mode', () => {
  it('should accept only the three known views', () => {
    expect([...VIEW_MODES]).toEqual(['list', 'cards', 'compact']);
    expect(isViewMode('cards')).toBe(true);
    expect(isViewMode('mosaic')).toBe(false);
    expect(isViewMode(null)).toBe(false);
  });
});

describe('useViewStore', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    delete globals.localStorage;
  });

  it('should start with the list view', () => {
    stubStorage();
    expect(useViewStore().mode).toBe('list');
  });

  it('should remember the chosen view', () => {
    const saved = stubStorage();

    useViewStore().set('compact');
    setActivePinia(createPinia());

    expect(saved['sv-view']).toBe('compact');
    expect(useViewStore().mode).toBe('compact');
  });

  it('should fall back to the list view when the stored value is unknown', () => {
    stubStorage({ 'sv-view': 'mosaic' });
    expect(useViewStore().mode).toBe('list');
  });

  it('should keep working when storage is unavailable', () => {
    globals.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = useViewStore();

    store.set('cards');

    expect(store.mode).toBe('cards');
  });
});
