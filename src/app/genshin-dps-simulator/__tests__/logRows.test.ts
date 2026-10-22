// The Combat Log takes its rows at the playhead from the whole run's
// (`rowsAt`): only an action with hits still to land is worked out again,
// every other row is the run's own object, so a memoized row is not drawn
// again each time the playhead crosses an event.
import { describe, expect, it } from 'vitest';

import {
  eventTimes,
  hitsOfAction,
  rowsAt,
} from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import { buildDefaultTeam, runTeam } from '../_lib/team';

const view = buildInspectorView(runTeam(buildDefaultTeam(), 'expected'));

// An action's row at `now`, as the log builds it: its hits so far.
type Row = { key: string; time: number; settlesAt: number; landed: number };
const rowOf = (action: (typeof view.actions)[number], now: number): Row => {
  const hits = hitsOfAction(view, action);
  return {
    key: action.key,
    time: action.start,
    settlesAt: Math.max(action.start, ...hits.map((hit) => hit.time)),
    landed: hits.filter((hit) => hit.time <= now).length,
  };
};
const actionByKey = new Map(view.actions.map((action) => [action.key, action]));
const runRows = view.actions
  .map((action) => rowOf(action, Number.POSITIVE_INFINITY))
  .sort((a, b) => b.time - a.time);
const rebuild = (row: Row, now: number) =>
  rowOf(actionByKey.get(row.key)!, now);

describe('the log’s rows at the playhead', () => {
  // Every moment something happens, and a moment just before it.
  const moments = eventTimes(view).flatMap((time) => [time - 0.01, time]);

  it('are the rows built from scratch there, at every moment', () => {
    moments.forEach((now) => {
      const fromScratch = view.actions
        .filter((action) => action.start <= now)
        .map((action) => rowOf(action, now))
        .sort((a, b) => b.time - a.time);
      expect(rowsAt(runRows, now, rebuild)).toEqual(fromScratch);
    });
  });

  it('keep the run’s own row once its last hit landed', () => {
    const now = view.duration / 2;
    const rows = rowsAt(runRows, now, rebuild);
    const settled = rows.filter((row) => row.settlesAt <= now);
    expect(settled.length).toBeGreaterThan(0);
    settled.forEach((row) =>
      expect(runRows.find((entry) => entry.key === row.key)).toBe(row)
    );
  });

  it('work out again only the actions with hits to land', () => {
    const pending = view.actions.find(
      (action) =>
        hitsOfAction(view, action).filter((hit) => hit.time > action.start)
          .length > 0
    )!;
    const now = pending.start;
    const asked: string[] = [];
    rowsAt(runRows, now, (row, at) => {
      asked.push(row.key);
      return rebuild(row, at);
    });
    expect(asked).toContain(pending.key);
    asked.forEach((key) => {
      const row = runRows.find((entry) => entry.key === key)!;
      expect(row.settlesAt).toBeGreaterThan(now);
      expect(row.time).toBeLessThanOrEqual(now);
    });
  });
});
