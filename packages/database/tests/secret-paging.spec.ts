import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { closeDatabase, createRepositories, openInMemoryDatabase } from '../src';

const VALUE = new Uint8Array(32).fill(1);
// Insertados en este orden: la posición manual sigue el orden de creación.
const NAMES = ['beta', 'Alfa', 'GAMMA', 'delta_2', 'delta_1'];

describe('secret ordering and paging', () => {
  let db: ReturnType<typeof openInMemoryDatabase>;
  let repos: ReturnType<typeof createRepositories>;
  let environmentId: number;

  beforeEach(async () => {
    db = openInMemoryDatabase();
    repos = createRepositories(db);
    environmentId = (await repos.environments.create(1, 'Local')).id;
    const created: number[] = [];
    for (const name of NAMES) {
      const input = { environmentId, name, valueEnc: VALUE, noteEnc: null };
      created.push((await repos.secrets.create(input)).id);
    }
    await repos.secrets.setPositions(environmentId, created);
  });

  afterEach(() => closeDatabase(db));

  const names = async (filter: Parameters<typeof repos.secrets.list>[0]) =>
    (await repos.secrets.list(filter)).map((secret) => secret.name);

  it('should sort A to Z ignoring case by default', async () => {
    expect(await names({ environmentId })).toEqual(['Alfa', 'beta', 'delta_1', 'delta_2', 'GAMMA']);
  });

  it('should sort Z to A', async () => {
    expect(await names({ environmentId, order: 'desc' })).toEqual([
      'GAMMA',
      'delta_2',
      'delta_1',
      'beta',
      'Alfa',
    ]);
  });

  it('should follow the stored position in manual order', async () => {
    expect(await names({ environmentId, order: 'manual' })).toEqual(NAMES);
  });

  it('should page over the sorted list, not sort each page', async () => {
    const page = (offset: number) => names({ environmentId, order: 'desc', limit: 2, offset });

    expect(await page(0)).toEqual(['GAMMA', 'delta_2']);
    expect(await page(2)).toEqual(['delta_1', 'beta']);
    expect(await page(4)).toEqual(['Alfa']);
    expect(await page(6)).toEqual([]);
  });

  it('should count every match, ignoring order and page', async () => {
    expect(await repos.secrets.count({ environmentId, limit: 2, offset: 4 })).toBe(5);
    expect(await repos.secrets.count({ query: 'DELTA' })).toBe(2);
    expect(await repos.secrets.count()).toBe(5);
  });
});
