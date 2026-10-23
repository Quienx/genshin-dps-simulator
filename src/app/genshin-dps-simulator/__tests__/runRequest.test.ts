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
    // The inspector test, with average CRITs (rolled ones move its
    // timings: random particles change when a Q has its Energy).
    const members = INSPECTOR_TEST_IDS.map(buildMemberValues);
    sameRun(
      executeRun({ kind: 'inspector', members, critMode: 'expected' }),
      runInspectorTest(members, 'expected')
    );
  });

  it('says how its CRITs were played; Average gives the same total each run', () => {
    const average = executeRun({ kind: 'team', team, critMode: 'expected' });
    expect(average.critMode).toBe('expected');
    expect(
      executeRun({ kind: 'team', team, critMode: 'expected' }).totalDamage
    ).toBe(average.totalDamage);
    expect(
      executeRun({ kind: 'team', team, critMode: 'random' }).critMode
    ).toBe('random');
    const members = INSPECTOR_TEST_IDS.map(buildMemberValues);
    expect(executeRun({ kind: 'inspector', members }).critMode).toBe('random');
    expect(
      executeRun({ kind: 'inspector', members, critMode: 'expected' }).critMode
    ).toBe('expected');
  });

  it('is plain data, and so is its run (they cross to the worker)', () => {
    const request: RunRequest = { kind: 'team', team, critMode: 'expected' };
    expect(structuredClone(request)).toEqual(request);
    const run = executeRun(request);
    sameRun(structuredClone(run), run);
  });
});
