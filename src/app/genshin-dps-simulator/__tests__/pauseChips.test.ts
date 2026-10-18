// A status that stops a special system's points from being spent
// (Mavuika's Q) shows next to that system in Active Effects.
import { describe, expect, it } from 'vitest';

import { buildInspectorView } from '../_lib/inspector';
import { buildMemberValues, createTeamBlock, runTeam } from '../_lib/team';

const view = () =>
  buildInspectorView(
    runTeam(
      {
        members: [buildMemberValues('mavuika'), buildMemberValues('citlali')],
        rotation: {
          loop: false,
          blocks: [
            'citlali:skill',
            'citlali:burst',
            'mavuika:burst',
            'mavuika:dodge',
            'mavuika:charged',
          ].map((id) => createTeamBlock(id)),
        },
        fillWhileWaiting: false,
        swapDelayFrames: 12,
      },
      'expected'
    )
  );

describe("Active Effects: Mavuika's Q pauses Nightsoul spending", () => {
  it('shows a block with the frozen points, as long as the Q', () => {
    const chips = view().chips.filter(
      (chip) => chip.blockId === 'mavuikaBurst' && !chip.hidden
    );
    const pause = chips.find((chip) => chip.type === 'state');
    expect(pause).toMatchObject({
      label: 'Crucible of Death and Life',
      value: 'No Nightsoul points spent',
      meter: { resource: 'nightsoul' },
    });
    expect(pause?.effect).toContain('Flamestrider');
    expect(pause?.effect).toContain("Nightsoul's Blessing");
    expect((pause?.end ?? 0) - (pause?.start ?? 0)).toBeCloseTo(7, 1);
    // The Q's DMG bonus keeps its own block.
    expect(chips.some((chip) => chip.type === 'bonus')).toBe(true);
  });
});
