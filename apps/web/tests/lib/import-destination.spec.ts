import { describe, expect, it } from 'bun:test';
import {
  CURRENT_ENVIRONMENT,
  isDestinationReady,
  newEnvironmentDestination,
} from '@/lib/import-destination';

describe('newEnvironmentDestination', () => {
  it('should propose the Postman name for a new environment in the given project', () => {
    expect(newEnvironmentDestination('col_dev', 3)).toEqual({
      mode: 'new',
      projectId: 3,
      name: 'col_dev',
    });
  });

  it('should shorten long names, drop control characters and fall back when nothing is left', () => {
    expect(newEnvironmentDestination('x'.repeat(80), 1).name).toHaveLength(40);
    expect(newEnvironmentDestination('uno\ndos', 1).name).toBe('uno dos');
    expect(newEnvironmentDestination('   ', 1).name).toBe('Postman');
    expect(newEnvironmentDestination(null, 1).name).toBe('Postman');
  });
});

describe('isDestinationReady', () => {
  it('should require an active environment to import into the current one', () => {
    expect(isDestinationReady(CURRENT_ENVIRONMENT, 1)).toBe(true);
    expect(isDestinationReady(CURRENT_ENVIRONMENT, null)).toBe(false);
  });

  it('should require a project and a valid name for a new environment', () => {
    expect(isDestinationReady({ mode: 'new', projectId: 1, name: 'QA' }, null)).toBe(true);
    expect(isDestinationReady({ mode: 'new', projectId: null, name: 'QA' }, 1)).toBe(false);
    expect(isDestinationReady({ mode: 'new', projectId: 1, name: '  ' }, 1)).toBe(false);
  });
});
