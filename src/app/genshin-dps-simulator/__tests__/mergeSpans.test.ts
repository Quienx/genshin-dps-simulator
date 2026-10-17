// A status renewed while up is one stretch on the chart, not one bar per
// application drawn over each other.
import { describe, expect, it } from 'vitest';

import { mergeSpans } from '../_components/timeline/timelineData';

describe('mergeSpans', () => {
  it('joins applications that overlap or touch, counting them', () => {
    expect(
      mergeSpans([
        { start: 1.83, end: 9.83 },
        { start: 3.87, end: 11.87 },
        { start: 4.18, end: 12.18 },
        { start: 12.18, end: 20.18 },
        { start: 30, end: 38 },
      ])
    ).toEqual([
      { start: 1.83, end: 20.18, count: 4 },
      { start: 30, end: 38, count: 1 },
    ]);
  });

  it('keeps an application inside a longer one in that stretch', () => {
    expect(
      mergeSpans([
        { start: 0, end: 10 },
        { start: 2, end: 4 },
      ])
    ).toEqual([{ start: 0, end: 10, count: 2 }]);
  });

  it('sorts first', () => {
    expect(
      mergeSpans([
        { start: 5, end: 6 },
        { start: 0, end: 1 },
      ]).map((span) => span.start)
    ).toEqual([0, 5]);
  });
});
