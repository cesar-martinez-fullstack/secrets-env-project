import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { PAGE_SIZE, isPaged, lastPage, pageRange } from '@/lib/pagination';
import { useDataStore } from '@/stores/data';
import { useSortStore } from '@/stores/sort';

describe('pagination helpers', () => {
  it('should page every view except the manual order of one environment', () => {
    expect(isPaged('asc', false)).toBe(true);
    expect(isPaged('manual', false)).toBe(false);
    expect(isPaged('manual', true)).toBe(true);
  });

  it('should compute the last page and the visible range', () => {
    expect(lastPage(0)).toBe(0);
    expect(lastPage(PAGE_SIZE)).toBe(0);
    expect(lastPage(PAGE_SIZE + 1)).toBe(1);
    expect(pageRange(1, 7, 57)).toEqual({ from: 51, to: 57 });
  });
});

describe('useDataStore paging', () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const realFetch = globalThis.fetch;
  let urls: string[];
  let respond: (url: URL) => Promise<Response>;

  const page = (names: string[], total: number) =>
    new Response(JSON.stringify(names.map((name, id) => ({ id, name }))), {
      headers: { 'X-Total-Count': String(total) },
    });
  const asked = () => new URL(urls.at(-1)!, 'http://local').searchParams;

  beforeEach(() => {
    setActivePinia(createPinia());
    globals.localStorage = { getItem: () => null, setItem: () => undefined };
    urls = [];
    respond = async () => page(['A'], 120);
    globalThis.fetch = (async (input: string) => {
      urls.push(input);
      return respond(new URL(input, 'http://local'));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete globals.localStorage;
  });

  it('should ask for the first sorted page and keep the total', async () => {
    const store = useDataStore();

    await store.refreshSecrets();

    expect([asked().get('limit'), asked().get('offset'), asked().get('order')]).toEqual([
      '50',
      '0',
      'asc',
    ]);
    expect(store.total).toBe(120);
  });

  it('should move between pages without leaving the valid range', async () => {
    const store = useDataStore();
    await store.refreshSecrets();

    await store.goToPage(2);
    expect(asked().get('offset')).toBe('100');

    await store.goToPage(99);
    expect(store.page).toBe(2);
    await store.goToPage(-1);
    expect(store.page).toBe(0);
  });

  it('should step back when the current page no longer has anything', async () => {
    const store = useDataStore();
    await store.refreshSecrets();
    await store.goToPage(2);
    respond = async (url) =>
      url.searchParams.get('offset') === '100' ? page([], 100) : page(['B'], 100);

    await store.refreshSecrets();

    expect(store.page).toBe(1);
    expect(store.secrets.map((s) => s.name)).toEqual(['B']);
  });

  it('should ask for everything in manual order', async () => {
    const store = useDataStore();
    useSortStore().set('manual');

    await store.refreshSecrets();

    expect(asked().has('limit')).toBe(false);
    expect(asked().get('order')).toBe('manual');
  });

  it('should not keep the previous rows when a reload fails', async () => {
    const store = useDataStore();
    await store.refreshSecrets();
    respond = async () => new Response('{}', { status: 500 });

    await expect(store.refreshSecrets()).rejects.toThrow();

    expect(store.secrets).toEqual([]);
    expect(store.total).toBe(0);
  });

  it('should ignore an older response that arrives after a newer one', async () => {
    const store = useDataStore();
    let releaseOld: (res: Response) => void = () => undefined;
    respond = () => new Promise((resolve) => (releaseOld = resolve));
    const old = store.refreshSecrets();
    respond = async () => page(['NUEVA'], 1);
    await store.refreshSecrets();

    releaseOld(page(['VIEJA'], 999));
    await old;

    expect(store.secrets.map((s) => s.name)).toEqual(['NUEVA']);
    expect(store.total).toBe(1);
    expect(store.loadingSecrets).toBe(false);
  });
});
