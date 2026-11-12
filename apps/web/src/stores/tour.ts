import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  IDLE_TOUR,
  TOUR_STEP_IDS,
  advanceTour,
  rewindTour,
  startTour,
  targetSelector,
} from '@/lib/tour';
import type { TourState, TourStepId } from '@/lib/tour';

const STORAGE_KEY = 'sv-tour';

type TourFlag = 'pending' | 'done';

function readFlag(): TourFlag | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'pending' || stored === 'done' ? stored : null;
  } catch {
    return null;
  }
}

function writeFlag(flag: TourFlag): void {
  try {
    localStorage.setItem(STORAGE_KEY, flag);
  } catch {
    // Sin almacenamiento el tour simplemente no se recuerda entre sesiones.
  }
}

function isVisible(id: TourStepId): boolean {
  const element = document.querySelector(targetSelector(id));
  if (!element) return false;
  const { width, height } = element.getBoundingClientRect();
  return width > 0 && height > 0;
}

export const useTourStore = defineStore('tour', () => {
  const state = ref<TourState>(IDLE_TOUR);
  const active = computed(() => state.value.active);
  const steps = computed(() => state.value.steps);
  const index = computed(() => state.value.index);
  const current = computed(() => state.value.steps[state.value.index] ?? null);
  const isLast = computed(() => state.value.index === state.value.steps.length - 1);
  const start = (): TourState => (state.value = startTour(TOUR_STEP_IDS.filter(isVisible)));
  function finish(): void {
    state.value = { ...state.value, active: false };
    writeFlag('done');
  }

  function next(): void {
    state.value = advanceTour(state.value);
    if (!state.value.active) writeFlag('done');
  }

  return {
    steps,
    index,
    active,
    current,
    isLast,
    request: () => writeFlag('pending'),
    start,
    startIfRequested: () => readFlag() === 'pending' && start(),
    next,
    back: () => (state.value = rewindTour(state.value)),
    finish,
  };
});
