export const TOUR_STEP_IDS = [
  'sidebar',
  'new-secret',
  'search',
  'import',
  'export',
  'security',
] as const;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];

export interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly top: number;
  readonly left: number;
}

const EDGE = 8;
const GAP = 12;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/** Coloca la tarjeta junto al elemento resaltado: debajo, encima, a la derecha o, si no cabe, abajo. */
export function placeCard(target: Box, card: Size, viewport: Size): Point {
  const maxLeft = viewport.width - card.width - EDGE;
  const maxTop = viewport.height - card.height - EDGE;
  const alignedLeft = clamp(target.left, EDGE, maxLeft);

  const below = target.top + target.height + GAP;
  if (below <= maxTop) return { top: below, left: alignedLeft };

  const above = target.top - card.height - GAP;
  if (above >= EDGE) return { top: above, left: alignedLeft };

  const right = target.left + target.width + GAP;
  if (right <= maxLeft) return { top: clamp(target.top, EDGE, maxTop), left: right };

  return { top: maxTop, left: alignedLeft };
}

export function targetSelector(id: TourStepId): string {
  return `[data-tour="${id}"]`;
}

export interface TourState {
  readonly steps: readonly TourStepId[];
  readonly index: number;
  readonly active: boolean;
}

export const IDLE_TOUR: TourState = { steps: [], index: 0, active: false };

export function startTour(steps: readonly TourStepId[]): TourState {
  return steps.length === 0 ? IDLE_TOUR : { steps, index: 0, active: true };
}

export function advanceTour(state: TourState): TourState {
  return state.index >= state.steps.length - 1
    ? { ...state, active: false }
    : { ...state, index: state.index + 1 };
}

export function rewindTour(state: TourState): TourState {
  return { ...state, index: Math.max(0, state.index - 1) };
}
