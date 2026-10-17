// A block's tooltip says what its character had when it was used: its
// Energy and its mechanic (Nightsoul points, Bond of Life), out of the max.
import { describe, expect, it } from 'vitest';

import { resourcesAtAction } from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import { buildDefaultTeam, runTeam } from '../_lib/team';

const run = runTeam(buildDefaultTeam(), 'expected');
const view = buildInspectorView(run);
const varesa = run.members.find((member) => member.characterId === 'varesa')!;

describe('resources at an action', () => {
  it("gives Varesa's Energy and Nightsoul points when her Q starts", () => {
    const kablam = view.actions.find(
      (action) => action.performedActionId === 'varesa:kablam'
    )!;
    const rows = resourcesAtAction(varesa, kablam);
    const energy = rows.find((row) => row.label === 'Energy')!;
    expect(energy.max).toBe(70);
    // Kablam costs 30: she had at least that when it started.
    expect(energy.value).toBeGreaterThanOrEqual(30);
    const points = rows.find((row) => /Nightsoul/.test(row.label))!;
    expect(points.max).toBe(40);
    expect(points.value).not.toBeNull();
  });

  it('reads the value before the action changes it', () => {
    const q = view.actions.find(
      (action) => action.performedActionId === 'varesa:kablam'
    )!;
    const energy = resourcesAtAction(varesa, q).find(
      (row) => row.label === 'Energy'
    )!;
    const after = resourcesAtAction(varesa, {
      ...q,
      start: q.end + 0.5,
    }).find((row) => row.label === 'Energy')!;
    expect(energy.value).toBeGreaterThan(after.value!);
  });
});
