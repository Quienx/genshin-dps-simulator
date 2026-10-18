// A held action's block: how long it is held (its hold time, else its
// spins) and how many charges (repeated hits) that gets.
import { describe, expect, it } from 'vitest';

import { chargesIn, heldFramesOf } from '../_lib/rotation/blocks';

const hold = {
  minFrames: 50,
  maxFrames: 375,
  releaseFrame: 56,
  everyFrames: 45,
  firstHitFrame: 35,
  hitEveryFrames: 42,
};

describe('a held block', () => {
  it('is held its hold time, within what the action allows', () => {
    expect(heldFramesOf({ hits: 1, heldSeconds: 1.3 }, hold)).toBe(78);
    expect(heldFramesOf({ hits: 1, heldSeconds: 0.1 }, hold)).toBe(50);
    expect(heldFramesOf({ hits: 1, heldSeconds: 99 }, hold)).toBe(375);
  });

  it('without one, is held for its spins as before', () => {
    // 4 spins: 56 + 3 × 45, so the Final lands where it did.
    expect(heldFramesOf({ hits: 4 }, hold)).toBe(191);
  });

  it('counts the charges that fit', () => {
    expect(chargesIn(50, hold)).toBe(1);
    expect(chargesIn(77, hold)).toBe(2);
    expect(chargesIn(78, hold)).toBe(2);
    expect(chargesIn(375, hold)).toBe(9);
    expect(chargesIn(30, hold)).toBe(0);
  });
});
