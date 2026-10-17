// A run counts its duration (60 s by default) and nothing after: a
// rotation of one's own (edit mode) still plays every block, so the chart
// can show the ones past it, but their hits do not count.
import { describe, expect, it } from 'vitest';

import {
  buildDefaultTeam,
  buildMemberValues,
  buildRotationFromRun,
  DEFAULT_SWAP_DELAY_FRAMES,
  runOwnRotation,
  runSolo,
  runTeam,
  TeamRun,
} from '../_lib/team';

const counted = (run: TeamRun) =>
  run.members.flatMap((member) => member.hitLog).filter((hit) => hit.counted);

describe('the counted duration', () => {
  it.each(['varesa', 'arlecchino', 'mualani'])(
    "keeps %s's result when its run becomes a rotation to edit",
    (characterId) => {
      const values = buildMemberValues(characterId);
      const before = runSolo(values, 'expected');
      const after = runOwnRotation(
        {
          members: [values],
          rotation: buildRotationFromRun(before),
          fillWhileWaiting: false,
          swapDelayFrames: 0,
          auras: false,
        },
        'expected'
      );
      expect(after.countedDuration).toBe(60);
      expect(after.totalDamage).toBeCloseTo(before.totalDamage, 6);
      expect(after.dps).toBeCloseTo(before.dps, 6);
      expect(after.members[0].damageByCategory).toEqual(
        before.members[0].damageByCategory
      );
    }
  );

  it('keeps the team result when its run becomes a rotation to edit', () => {
    const team = buildDefaultTeam();
    const before = runTeam(team, 'expected');
    const after = runOwnRotation(
      {
        ...team,
        fillWhileWaiting: false,
        swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES,
        rotation: buildRotationFromRun(before),
      },
      'expected'
    );
    expect(after.dps).toBeCloseTo(before.dps, 6);
  });

  it('plays the blocks past it, without counting their hits', () => {
    const values = buildMemberValues('varesa');
    const before = runSolo(values, 'expected');
    const rotation = buildRotationFromRun(before);
    // The same rotation twice: half of it is past 60 s.
    const run = runOwnRotation(
      {
        members: [values],
        rotation: {
          ...rotation,
          blocks: [
            ...rotation.blocks,
            ...rotation.blocks.map((block) => ({
              ...block,
              uid: `${block.uid}-again`,
            })),
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
    expect(run.countedDuration).toBe(60);
    expect(run.duration).toBeGreaterThan(100);
    expect(run.trace.at(-1)!.startTime).toBeGreaterThan(100);
    const late = run.members[0].hitLog.filter((hit) => hit.time >= 60);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((hit) => hit.counted === false)).toBe(true);
    const sum = counted(run).reduce((total, hit) => total + hit.damage, 0);
    expect(run.totalDamage).toBeCloseTo(sum, 6);
    expect(run.dps).toBeCloseTo(run.totalDamage / 60, 6);
  });
});
