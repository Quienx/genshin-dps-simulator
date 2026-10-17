import { describe, expect, it } from 'vitest';

import { RotationActionKind } from '../_lib/rotation/rotationSchema';
import { getCooldownLanes } from '../_lib/rotation/timeStrip';
import { RotationTraceEntry } from '../_lib/rotation/types';

const entry = (
  kind: RotationActionKind,
  startTime: number,
  endTime: number,
  performedAction?: string
): RotationTraceEntry => ({
  blockUid: '',
  action: kind,
  kind,
  seconds: 0,
  comboIndex: null,
  label: performedAction ?? kind,
  startTime,
  endTime,
  waitedSeconds: 0,
  warning: null,
  note: null,
  performedAction,
});

describe('cooldown lanes', () => {
  it('draws each use of the E and the Q until its cooldown ends', () => {
    const lanes = getCooldownLanes(
      [entry('skill', 0, 0.5), entry('normal', 0.5, 1), entry('burst', 1, 2)],
      [
        {
          actionId: 'skill',
          label: 'E',
          events: [{ time: 0, readyAt: 6, charges: [6] }],
        },
        {
          actionId: 'burst',
          label: 'Q',
          events: [{ time: 1, readyAt: 16, charges: [16] }],
        },
      ],
      30
    );
    expect(lanes.map((lane) => [lane.kind, lane.charges])).toEqual([
      ['skill', 1],
      ['burst', 1],
    ]);
    expect(lanes[0].bars).toEqual([
      { start: 0, end: 6, charge: 0, label: 'skill' },
    ]);
    expect(lanes[1].bars).toEqual([
      { start: 1, end: 16, charge: 0, label: 'burst' },
    ]);
  });

  it('leaves out the special forms (a free E, a Kablam)', () => {
    const lanes = getCooldownLanes(
      [entry('skill', 0, 0.5, 'freeFieryRush'), entry('burst', 1, 2, 'kablam')],
      [
        {
          actionId: 'burst',
          label: 'Q',
          events: [{ time: 1, readyAt: 2, charges: [2] }],
        },
      ],
      30
    );
    expect(lanes.flatMap((lane) => lane.bars)).toEqual([]);
  });

  it('puts each charge on its own line', () => {
    // 2 charges of 9 s, recharging one at a time: used at 0 (back at 9)
    // and at 2 (back at 18).
    const lanes = getCooldownLanes(
      [entry('skill', 0, 0.5), entry('skill', 2, 2.5)],
      [
        {
          actionId: 'skill',
          label: 'E',
          events: [
            { time: 0, readyAt: 0, charges: [9, 0] },
            { time: 2, readyAt: 9, charges: [9, 18] },
          ],
        },
      ],
      30
    );
    expect(lanes[0].charges).toBe(2);
    expect(lanes[0].bars).toEqual([
      { start: 0, end: 9, charge: 0, label: 'skill' },
      { start: 2, end: 18, charge: 1, label: 'skill' },
    ]);
  });

  it('follows cooldown cuts after the use', () => {
    const lanes = getCooldownLanes(
      [entry('skill', 0, 0.5)],
      [
        {
          actionId: 'skill',
          label: 'E',
          events: [
            { time: 0, readyAt: 10, charges: [10] },
            { time: 3, readyAt: 8, charges: [8] },
          ],
        },
      ],
      30
    );
    expect(lanes[0].bars[0].end).toBe(8);
  });

  it('counts a held cooldown until it is back', () => {
    // Mualani's E: held while she surfs, then 6 s from 8.
    const lanes = getCooldownLanes(
      [entry('skill', 0, 0.3)],
      [
        {
          actionId: 'skill',
          label: 'E',
          holds: [0],
          events: [{ time: 8, readyAt: 14, charges: [14] }],
        },
      ],
      30
    );
    expect(lanes[0].bars).toEqual([
      { start: 0, end: 14, charge: 0, label: 'skill' },
    ]);
  });

  it('cuts what goes past the end of the simulation', () => {
    const lanes = getCooldownLanes(
      [entry('burst', 0, 1)],
      [
        {
          actionId: 'burst',
          label: 'Q',
          events: [{ time: 0, readyAt: 18, charges: [18] }],
        },
      ],
      10
    );
    expect(lanes[0].bars[0].end).toBe(10);
  });
});
