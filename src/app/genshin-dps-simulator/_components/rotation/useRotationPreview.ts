import { useDeferredValue, useMemo } from 'react';

import {
  ExpectedRun,
  runExpected,
  traceToCharacterRotation,
} from '../../_lib/rotation/automaticRotation';
import { getComboIndexesByBlock } from '../../_lib/rotation/blocks';
import { RotationSetting, RotationTraceEntry } from '../../_lib/rotation/types';
import { withRotation } from '../../_lib/simulationValues';
import { SimulationValues } from '../../_lib/types';

export type RotationPreview = {
  duration: number;
  automatic: ExpectedRun & {
    rotation: RotationSetting;
    // The copied blocks replayed: same actions, each tied to its block.
    blockTrace: RotationTraceEntry[];
    combosByBlock: Record<string, number[]>;
  };
  custom: (ExpectedRun & { combosByBlock: Record<string, number[]> }) | null;
};

const withCombos = (run: ExpectedRun) => ({
  ...run,
  combosByBlock: getComboIndexesByBlock(run.trace),
});

// The deferred value keeps typing responsive while the preview recomputes.
const useRotationPreview = (values: SimulationValues): RotationPreview => {
  const deferredValues = useDeferredValue(values);

  return useMemo(() => {
    const automaticRun = runExpected(withRotation(deferredValues, null));
    const automaticRotation = traceToCharacterRotation(
      deferredValues,
      automaticRun.trace
    );
    // Replaying the copied blocks ties every action to its block, which the
    // automatic trace itself cannot do. Both runs play the same actions.
    const replay = runExpected(withRotation(deferredValues, automaticRotation));
    return {
      duration: automaticRun.duration,
      automatic: {
        ...automaticRun,
        rotation: automaticRotation,
        blockTrace: replay.trace,
        combosByBlock: getComboIndexesByBlock(replay.trace),
        // Only the replay ties hits to blocks.
        damageByBlock: replay.damageByBlock,
      },
      custom: deferredValues.rotation
        ? withCombos(runExpected(deferredValues))
        : null,
    };
  }, [deferredValues]);
};

export default useRotationPreview;
