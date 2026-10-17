import { describe, expect, it } from 'vitest';

import { RotationActionKind } from '../_lib/rotation/rotationSchema';
import {
  computeTimelineLayout,
  getTimelineTime,
  getTimelineX,
  MIN_PIECE_WIDTH,
  PIECE_GAP,
  PX_PER_SECOND,
  splitTimelineRows,
} from '../_lib/rotation/timelineLayout';
import { RotationBlock, RotationTraceEntry } from '../_lib/rotation/types';

const block = (uid: string, action: string): RotationBlock => ({
  uid,
  action,
  hits: 1,
  repeat: 1,
  seconds: 0,
  dashCancel: false,
});

const entry = (
  blockUid: string,
  kind: RotationActionKind,
  startTime: number,
  endTime: number
): RotationTraceEntry => ({
  blockUid,
  action: kind,
  kind,
  seconds: 0,
  comboIndex: null,
  label: kind,
  startTime,
  endTime,
  waitedSeconds: 0,
  warning: null,
  note: null,
});

describe('timeline positions', () => {
  // E for 2 s, then a 0.5 s Charged Attack (shown at its minimum width),
  // then idle until 10 s.
  const blocks = [block('e', 'skill'), block('c', 'charged')];
  const trace = [entry('e', 'skill', 0, 2), entry('c', 'charged', 2, 2.5)];
  const layout = computeTimelineLayout(blocks, trace, 10, false);
  const second = 2 * PX_PER_SECOND + PIECE_GAP;

  it('places a time where the piece playing then is drawn', () => {
    expect(getTimelineX(layout, 0, 10)).toBe(0);
    expect(getTimelineX(layout, 1, 10)).toBe(PX_PER_SECOND);
    // Inside the stretched piece, time maps onto its whole width.
    expect(getTimelineX(layout, 2.25, 10)).toBeCloseTo(
      second + MIN_PIECE_WIDTH / 2,
      6
    );
  });

  it('places times after the first pass on its tail', () => {
    const tail = layout.tail!;
    expect(getTimelineX(layout, 2.5, 10)).toBe(tail.left);
    expect(getTimelineX(layout, 10, 10)).toBe(tail.left + tail.width);
    expect(getTimelineX(layout, 6.25, 10)).toBeCloseTo(
      tail.left + tail.width / 2,
      6
    );
  });

  it('reads back the time under a position', () => {
    [0, 1, 1.9, 2.25, 2.4, 3, 6.25, 10].forEach((time) =>
      expect(
        getTimelineTime(layout, getTimelineX(layout, time, 10), 10)
      ).toBeCloseTo(time, 6)
    );
  });

  it("reads a gap between pieces as the next one's start", () => {
    expect(getTimelineTime(layout, 2 * PX_PER_SECOND + 2, 10)).toBe(2);
  });
});

describe('splitting the timeline into rows', () => {
  const blocks = ['a', 'b', 'c', 'd'].map((uid) => block(uid, 'skill'));
  const trace = [
    entry('a', 'skill', 0, 4),
    entry('b', 'skill', 4, 9),
    entry('c', 'skill', 9, 12),
    entry('d', 'skill', 12, 25),
  ];
  const layout = computeTimelineLayout(blocks, trace, 30, false);
  const rows = splitTimelineRows(layout, 10, 30);

  it('puts each piece in the 10 s row where it starts', () => {
    expect(rows.map((row) => row.indexes)).toEqual([[0, 1, 2], [3], []]);
  });

  it('starts every row where the one before ends', () => {
    // "c" starts at 9 s and runs to 12 s: the second row starts at 12 s.
    expect(rows.map((row) => [row.from, row.to])).toEqual([
      [0, 12],
      [12, 25],
      [25, 30],
    ]);
  });

  it('starts every row at the left edge, with its own ticks', () => {
    expect(rows[1].layout.pieces[0].left).toBe(0);
    // Its start, then every 5 s.
    expect(rows[1].layout.ticks.map((tick) => tick.time)).toEqual([12, 15, 20]);
    expect(rows[1].layout.ticks[0].x).toBe(0);
    expect(rows[1].layout.ticks[1].x).toBeCloseTo((15 - 12) * PX_PER_SECOND, 6);
  });

  it('keeps the tail on the last row only', () => {
    expect(rows[0].layout.tail).toBeNull();
    expect(rows[2].layout.tail?.from).toBe(25);
    expect(rows[2].layout.tail?.left).toBe(0);
  });
});

describe('timeline scale', () => {
  it('can draw more pixels per second (wider rows)', () => {
    const blocks = [block('a', 'skill'), block('b', 'burst')];
    const trace = [entry('a', 'skill', 0, 2), entry('b', 'burst', 2, 5)];
    const layout = computeTimelineLayout(blocks, trace, 5, false, 60);
    expect(layout.pieces.map((piece) => piece.width)).toEqual([120, 180]);
  });
});

describe('rows after the rotation ends', () => {
  // The rotation is over at 14 s of a 60 s run.
  const blocks = ['a', 'b'].map((uid) => block(uid, 'skill'));
  const trace = [entry('a', 'skill', 0, 9), entry('b', 'skill', 9, 14)];
  const rows = splitTimelineRows(
    computeTimelineLayout(blocks, trace, 60, false),
    10,
    60
  );

  it('leaves out empty rows that last no time, keeping the idle tail', () => {
    expect(rows.map((row) => [row.from, row.to])).toEqual([
      [0, 14],
      [14, 60],
    ]);
  });

  it('never starts two rows at the same time', () => {
    const starts = rows.map((row) => row.from);
    expect(new Set(starts).size).toBe(starts.length);
  });
});
