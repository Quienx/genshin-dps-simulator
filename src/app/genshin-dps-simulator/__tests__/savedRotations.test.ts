// An edited rotation is saved (in the browser) and comes back on reload,
// checked against the characters as they are now.
import { describe, expect, it } from 'vitest';

import { block } from './fixtures';
import {
  decodeSavedRotations,
  encodeSavedRotations,
} from '../_components/timeline/savedRotations';
import { createTeamBlock } from '../_lib/team';

const setup = {
  rotation: {
    loop: false,
    blocks: [
      block('team-1', 'nicole:skill'),
      block('team-2', 'nicole:wait', { seconds: 1.5 }),
    ],
  },
  fillWhileWaiting: false,
  swapDelayFrames: 12,
  auras: true,
};
const known = () => new Set(['nicole:skill', 'nicole:wait']);

describe('saved rotations', () => {
  it('comes back as it was saved, with fresh block ids', () => {
    const saved = decodeSavedRotations(
      encodeSavedRotations({ team: setup }),
      known
    );
    const blocks = saved.team.rotation.blocks;
    expect(blocks.map((entry) => [entry.action, entry.seconds])).toEqual([
      ['nicole:skill', 0],
      ['nicole:wait', 1.5],
    ]);
    // Ids from the counter, which starts again on reload: a block added
    // after it never clashes with a restored one.
    const added = createTeamBlock('nicole:skill').uid;
    expect(blocks.map((entry) => entry.uid)).not.toContain(added);
    expect(new Set(blocks.map((entry) => entry.uid)).size).toBe(2);
    expect(saved.team.swapDelayFrames).toBe(12);
  });

  it('drops blocks of actions that no longer exist, and empty rotations', () => {
    const saved = decodeSavedRotations(
      encodeSavedRotations({
        team: setup,
        solo: {
          ...setup,
          rotation: { loop: false, blocks: [block('x', 'gone:skill')] },
        },
      }),
      known
    );
    expect(saved.team.rotation.blocks).toHaveLength(2);
    expect(saved.solo).toBeUndefined();
  });

  it('ignores anything it cannot read', () => {
    expect(decodeSavedRotations(null, known)).toEqual({});
    expect(decodeSavedRotations('not json', known)).toEqual({});
    expect(decodeSavedRotations('{"version":99}', known)).toEqual({});
  });
});
