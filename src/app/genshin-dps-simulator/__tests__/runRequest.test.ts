// A run asked as plain data (what the simulation worker gets) is the run
// the functions make.
import { describe, expect, it } from 'vitest';

import { executeRun, RunRequest } from '../_lib/runRequest';
import {
  buildMemberValues,
  buildPresetTeam,
  INSPECTOR_TEST_IDS,
  MAVUIKA_PRESETS,
  runInspectorTest,
  runOwnRotation,
  runSolo,
  runTeam,
  TeamRun,
} from '../_lib/team';

const sameRun = (first: TeamRun, second: TeamRun) => {
  expect(first.totalDamage).toBeCloseTo(second.totalDamage, 6);
  expect(first.duration).toBe(second.duration);
  expect(first.trace.map((entry) => entry.startTime)).toEqual(
    second.trace.map((entry) => entry.startTime)
  );
};

describe('a run request', () => {
  const team = buildPresetTeam(MAVUIKA_PRESETS[0]);

  it('plays a team, a rotation of one’s own, one character and the test', () => {
    sameRun(
      executeRun({ kind: 'team', team, critMode: 'expected' }),
      runTeam(team, 'expected')
    );
    sameRun(
      executeRun({ kind: 'own', team, critMode: 'expected' }),
      runOwnRotation(team, 'expected')
    );
    const values = buildMemberValues('mavuika');
    sameRun(
      executeRun({ kind: 'solo', values, critMode: 'expected' }),
      runSolo(values, 'expected')
    );
    // The inspector test rolls its CRITs: the same timings, not DMG.
    const members = INSPECTOR_TEST_IDS.map(buildMemberValues);
    expect(
      executeRun({ kind: 'inspector', members }).trace.map(
        (entry) => entry.startTime
      )
    ).toEqual(runInspectorTest(members).trace.map((entry) => entry.startTime));
  });

  it('is plain data, and so is its run (they cross to the worker)', () => {
    const request: RunRequest = { kind: 'team', team, critMode: 'expected' };
    expect(structuredClone(request)).toEqual(request);
    const run = executeRun(request);
    sameRun(structuredClone(run), run);
  });
});
