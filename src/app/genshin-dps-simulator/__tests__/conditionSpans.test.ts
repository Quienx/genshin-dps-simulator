import { describe, expect, it } from 'vitest';

import { conditionSpans } from '../_lib/conditionSpans';

const activity = {
  resources: {
    bondOfLife: [
      { frame: 0, value: 0 },
      { frame: 100, value: 130 },
      { frame: 200, value: 25 },
      { frame: 300, value: 60 },
      { frame: 400, value: 0 },
    ],
  },
  statuses: { blessing: [{ start: 150, end: 350 }] },
  stacks: {
    marks: [
      { start: 120, end: 500 },
      { start: 140, end: 500 },
    ],
  },
};

describe('conditionSpans', () => {
  it('spans the frames a resource meets its bounds', () => {
    expect(conditionSpans({ bondOfLife: { gte: 30 } }, activity, 600)).toEqual([
      { start: 100, end: 200 },
      { start: 300, end: 400 },
    ]);
    expect(conditionSpans({ bondOfLife: { gt: 0 } }, activity, 600)).toEqual([
      { start: 100, end: 400 },
    ]);
  });

  it('reads a status as 1 while up and stacks as their count', () => {
    expect(
      conditionSpans(
        { bondOfLife: { gte: 30 }, blessing: { gte: 1 } },
        activity,
        600
      )
    ).toEqual([
      { start: 150, end: 200 },
      { start: 300, end: 350 },
    ]);
    expect(conditionSpans({ marks: { gte: 2 } }, activity, 600)).toEqual([
      { start: 140, end: 500 },
    ]);
  });

  it('runs to the end of the run when it still holds', () => {
    expect(conditionSpans({ bondOfLife: { gte: 0 } }, activity, 600)).toEqual([
      { start: 0, end: 600 },
    ]);
  });
});
