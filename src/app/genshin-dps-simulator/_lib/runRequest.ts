import {
  runInspectorTest,
  runOwnRotation,
  runSolo,
  runTeam,
  TeamRun,
  TeamRunSetup,
  TeamState,
} from './team';
import { CritMode, SimulationValues } from './types';

// A run to make, as plain data: it can go to the simulation worker (a
// function could not), which plays it with `executeRun`.
// - team: a team with its rotation, or none (its automatic list);
// - own: a rotation of one's own (edit mode), as long as its blocks need;
// - solo: one character alone, as on its own screen;
// - inspector: the team screen's inspector test.
export type RunRequest =
  | { kind: 'team'; team: TeamRunSetup; critMode: CritMode }
  | { kind: 'own'; team: TeamState; critMode: CritMode }
  | { kind: 'solo'; values: SimulationValues; critMode: CritMode }
  | { kind: 'inspector'; members: SimulationValues[] };

export const executeRun = (request: RunRequest): TeamRun => {
  switch (request.kind) {
    case 'team':
      return runTeam(request.team, request.critMode);
    case 'own':
      return runOwnRotation(request.team, request.critMode);
    case 'solo':
      return runSolo(request.values, request.critMode);
    case 'inspector':
      return runInspectorTest(request.members);
  }
};
