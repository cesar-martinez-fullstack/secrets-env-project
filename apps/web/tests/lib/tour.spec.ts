import { describe, expect, it } from 'bun:test';
import { placeCard } from '@/lib/tour';

const viewport = { width: 1000, height: 700 };
const card = { width: 320, height: 160 };

describe('placeCard', () => {
  it('should place the card below the target when there is room', () => {
    const point = placeCard({ top: 100, left: 200, width: 100, height: 40 }, card, viewport);

    expect(point).toEqual({ top: 152, left: 200 });
  });

  it('should place the card above the target when there is no room below', () => {
    const point = placeCard({ top: 600, left: 200, width: 100, height: 40 }, card, viewport);

    expect(point).toEqual({ top: 428, left: 200 });
  });

  it('should place the card to the right of a target that fills the height', () => {
    const point = placeCard({ top: 0, left: 0, width: 256, height: 700 }, card, viewport);

    expect(point).toEqual({ top: 8, left: 268 });
  });

  it('should keep the card inside the viewport horizontally', () => {
    const point = placeCard({ top: 100, left: 950, width: 40, height: 40 }, card, viewport);

    expect(point.left).toBe(viewport.width - card.width - 8);
  });

  it('should fall back to the bottom edge when nothing else fits', () => {
    const point = placeCard({ top: 0, left: 0, width: 990, height: 700 }, card, viewport);

    expect(point).toEqual({ top: 532, left: 8 });
  });
});
