// A team's timeline shows what each step dealt in the Simulate run (CRITs
// rolled), CRIT or not, not the expected average.
import { describe, expect, it } from 'vitest';

import { getPieceDetails } from '../_lib/rotation/pieceDetails';
import { RotationAction } from '../_lib/rotation/rotationSchema';
import { TimelinePiece } from '../_lib/rotation/timelineLayout';
import { RotationBlock } from '../_lib/rotation/types';
import { buildDefaultTeam, runTeam } from '../_lib/team';

const block: RotationBlock = {
  uid: 'b1',
  action: 'varesa:qSpecial',
  hits: 1,
  repeat: 1,
  seconds: 0,
  dashCancel: false,
};
const action = {
  id: 'varesa:qSpecial',
  kind: 'burst',
  label: 'Varesa: Q special',
  shortLabel: 'Q special',
} as RotationAction;
const piece: TimelinePiece = {
  uid: 'b1',
  start: 7.4,
  end: 7.9,
  waited: 0,
  left: 0,
  width: 40,
};
const details = (input: Partial<Parameters<typeof getPieceDetails>[0]>) =>
  getPieceDetails({
    block,
    action,
    piece,
    presses: [],
    cooldowns: [],
    note: null,
    warning: null,
    ...input,
  }).rows;

describe('rolled block damage', () => {
  it('counts the CRITs of each block in a Simulate run', () => {
    const run = runTeam(buildDefaultTeam(), 'random');
    const hits = run.members.flatMap((member) => member.hitLog);
    Object.entries(run.damageByBlock).forEach(([uid, damage]) => {
      const crits = hits.filter(
        (hit) => hit.blockUid === uid && hit.isCrit
      ).length;
      expect(damage.crits).toBe(crits);
    });
  });

  it('leaves CRITs out of expected runs', () => {
    const run = runTeam(buildDefaultTeam(), 'expected');
    Object.values(run.damageByBlock).forEach((damage) =>
      expect(damage.crits).toBeUndefined()
    );
  });

  it('shows the rolled DMG and whether it CRIT, without the max hit', () => {
    const rows = details({
      damage: { damage: 82524, hits: 1, share: 0.04, maxHit: 233460, crits: 0 },
    });
    expect(rows).toContainEqual({ label: 'CRIT', value: 'no' });
    expect(rows.find((row) => row.label === 'DMG')?.value).toMatch(/^82,524/);
    expect(rows.some((row) => row.label === 'Max hit')).toBe(false);
  });

  it('counts the CRITs of a block with several hits', () => {
    const rows = details({
      damage: { damage: 50000, hits: 3, share: 0.02, maxHit: 30000, crits: 2 },
    });
    expect(rows).toContainEqual({ label: 'CRIT', value: '2 of 3' });
  });

  it('says to simulate when there is no rolled run yet', () => {
    const rows = details({ damageNote: 'Press Simulate team' });
    expect(rows).toContainEqual({ label: 'DMG', value: 'Press Simulate team' });
  });
});
