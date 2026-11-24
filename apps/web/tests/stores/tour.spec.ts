import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { TOUR_STEP_IDS } from '@/lib/tour';
import { useTourStore } from '@/stores/tour';

const globals = globalThis as unknown as Record<string, unknown>;
const visibleBox = { width: 10, height: 10 };

function stubBrowser(visibleIds: readonly string[], saved: Record<string, string> = {}): void {
  globals.document = {
    querySelector: (selector: string) =>
      visibleIds.some((id) => selector === `[data-tour="${id}"]`)
        ? { getBoundingClientRect: () => visibleBox }
        : null,
  };
  globals.localStorage = {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => {
      saved[key] = value;
    },
  };
}

describe('useTourStore', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    delete globals.document;
    delete globals.localStorage;
  });

  it('should not start when no tour was requested', () => {
    stubBrowser(TOUR_STEP_IDS);
    const tour = useTourStore();

    tour.startIfRequested();

    expect(tour.active).toBe(false);
  });

  it('should start after a request, with only the steps whose target is visible', () => {
    stubBrowser(['sidebar', 'search']);
    const tour = useTourStore();

    tour.request();
    tour.startIfRequested();

    expect(tour.active).toBe(true);
    expect(tour.steps).toEqual(['sidebar', 'search']);
  });

  it('should walk forward and back through the steps', () => {
    stubBrowser(TOUR_STEP_IDS);
    const tour = useTourStore();
    tour.start();

    tour.next();
    tour.next();
    tour.back();

    expect(tour.current).toBe(TOUR_STEP_IDS[1]);
  });

  it('should finish and not start again after the last step', () => {
    stubBrowser(['sidebar']);
    const tour = useTourStore();
    tour.request();
    tour.startIfRequested();

    tour.next();
    tour.startIfRequested();

    expect(tour.active).toBe(false);
  });

  it('should be restartable on demand after finishing', () => {
    stubBrowser(TOUR_STEP_IDS);
    const tour = useTourStore();
    tour.start();
    tour.finish();

    tour.start();

    expect(tour.active).toBe(true);
    expect(tour.index).toBe(0);
  });

  it('should not start when no target is visible', () => {
    stubBrowser([]);
    const tour = useTourStore();

    tour.start();

    expect(tour.active).toBe(false);
  });
});
