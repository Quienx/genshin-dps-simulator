// A held action's block: how long it is held (its hold time, else its
// spins) and how many charges (repeated hits) that gets.
import { describe, expect, it } from 'vitest';

import {
  cancelHoldsBefore,
  chargesIn,
  expandBlocks,
  heldFramesOf,
} from '../_lib/rotation/blocks';
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
  const rotation = (heldSeconds: number) => ({
    loop: false,
    blocks: [
      { ...createTeamBlock('mavuika:charged'), heldSeconds },
      createTeamBlock('mavuika:dodge'),
    ],
  });

  it('loses its Final when the Dash is dropped right after it', () => {
    const start = rotation(1.3);
    const dropped = cancelHoldsBefore(start, actions, [start.blocks[1].uid]);
    expect(dropped.blocks[0].noFinal).toBe(true);
    expect(expandBlocks(dropped, actions)[0].held?.cancel).toBe(true);
  });

  it('keeps it when nothing was dropped after it', () => {
    const start = rotation(1.3);
    expect(
      cancelHoldsBefore(start, actions, ['other']).blocks[0].noFinal
    ).toBeUndefined();
    expect(expandBlocks(start, actions)[0].held?.cancel).toBeUndefined();
  });

  it('keeps it held to the cap even with the Final off (the game forces it)', () => {
    const start = rotation(6.25);
    const dropped = cancelHoldsBefore(start, actions, [start.blocks[1].uid]);
    expect(expandBlocks(dropped, actions)[0].held?.cancel).toBeUndefined();
  });
});
