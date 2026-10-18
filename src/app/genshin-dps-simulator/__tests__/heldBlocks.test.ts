// A held action's block: how long it is held (its hold time, else its
// spins) and how many charges (repeated hits) that gets.
import { describe, expect, it } from 'vitest';

import { chargesIn, expandBlocks, heldFramesOf } from '../_lib/rotation/blocks';
import { createTeamBlock, getTeamActions } from '../_lib/team';

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

describe('a held block before a Dash', () => {
  const actions = getTeamActions(['mavuika']);
  const steps = (heldSeconds: number) =>
    expandBlocks(
      {
        loop: false,
        blocks: [
          { ...createTeamBlock('mavuika:charged'), heldSeconds },
          createTeamBlock('mavuika:dodge'),
        ],
      },
      actions
    );

  it('is cancelled by it', () => {
    expect(steps(1.3)[0].held?.cancel).toBe(true);
  });

  it('keeps its Final when held to the cap (the game forces it)', () => {
    expect(steps(6.25)[0].held?.cancel).toBeUndefined();
  });
});
