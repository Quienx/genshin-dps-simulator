// Mavuika's E recast: in Nightsoul's Blessing, an E while it recharges
// switches between the Ring and the Flamestrider, a second apart.
import { describe, expect, it } from 'vitest';

import { buildMemberValues, createTeamBlock, runTeam } from '../_lib/team';

const trace = (blocks: { hold?: boolean }[]) =>
  runTeam(
    {
      members: [buildMemberValues('mavuika')],
      rotation: {
        loop: false,
        blocks: blocks.map(({ hold }) => ({
          ...createTeamBlock('mavuika:skill'),
          hold,
        })),
      },
      fillWhileWaiting: false,
      swapDelayFrames: 0,
      auras: false,
    },
    'expected'
  ).trace.map((entry) => ({
    action: entry.performedAction ?? entry.action,
    start: Math.round(entry.startTime * 60),
  }));

describe("Mavuika's E recast", () => {
  it('after a Hold E, an E waits the recast second and leaves the bike', () => {
    expect(trace([{ hold: true }, {}])).toEqual([
      { action: 'mavuika:skillHold', start: 0 },
      // 24 frames into the Hold E, then the 60-frame recast cooldown.
      { action: 'mavuika:recastToRing', start: 84 },
    ]);
  });

  it('after an E, an E (held or not) rides the bike', () => {
    expect(trace([{}, {}])[1].action).toBe('mavuika:recastToBike');
    expect(trace([{}, { hold: true }])[1].action).toBe(
      'mavuika:recastToBikeHold'
    );
  });
});
