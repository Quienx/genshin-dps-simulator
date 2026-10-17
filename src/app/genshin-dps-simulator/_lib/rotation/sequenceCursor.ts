import { RotationStep } from './types';

export type SequenceCursor = {
  // The next step, or null when the rotation is over (no loop).
  next: () => RotationStep | null;
};

export const createSequenceCursor = (
  steps: RotationStep[],
  loop: boolean
): SequenceCursor => {
  let index = 0;

  return {
    next: () => {
      if (steps.length === 0) {
        return null;
      }
      if (index >= steps.length) {
        if (!loop) {
          return null;
        }
        index = 0;
      }
      const step = steps[index];
      index += 1;
      return step;
    },
  };
};
