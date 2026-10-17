import { useDeferredValue, useMemo } from 'react';

import { getComboIndexesByBlock } from '../../_lib/rotation/blocks';
import { runTeamExpected, TeamRun, TeamState } from '../../_lib/team';

export type TeamPreview = TeamRun & {
  combosByBlock: Record<string, number[]>;
};

// The deferred value keeps editing responsive while the team recomputes.
const useTeamPreview = (team: TeamState): TeamPreview => {
  const deferredTeam = useDeferredValue(team);
  return useMemo(() => {
    const run = runTeamExpected(deferredTeam);
    return { ...run, combosByBlock: getComboIndexesByBlock(run.trace) };
  }, [deferredTeam]);
};

export default useTeamPreview;
