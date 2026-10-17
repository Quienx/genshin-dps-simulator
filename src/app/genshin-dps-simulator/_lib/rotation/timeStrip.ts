import { RotationTraceEntry } from './types';
import { CooldownEvent, CooldownTrack } from '../types';

// The E and the Q under the rotation: each use, from when it starts until
// its cooldown ends, so you can see when it is available again.
export type CooldownLaneKind = 'skill' | 'burst';

export type CooldownBar = {
  start: number;
  // When the charge it used is back (after any cut).
  end: number;
  // The line it goes on: one per charge, as their cooldowns overlap.
  charge: number;
  label: string;
};

export type CooldownLane = {
  kind: CooldownLaneKind;
  charges: number;
  bars: CooldownBar[];
};

const LANE_KINDS: CooldownLaneKind[] = ['skill', 'burst'];

const SAME_TIME = 1e-6;

const chargesOf = (event: CooldownEvent): number[] =>
  event.charges ?? [event.readyAt];

// The charge a use took and when it is back: the one its cooldown event
// changed, followed through the later events (cuts) until it is ready.
const getBar = (
  use: RotationTraceEntry,
  track: CooldownTrack,
  duration: number
): CooldownBar | null => {
  const { events } = track;
  const start = use.startTime;
  const held = (track.holds ?? []).some(
    (time) => Math.abs(time - start) < SAME_TIME
  );
  // A held cooldown starts with the first event after it.
  const index = events.findIndex((event) =>
    held ? event.time > start : Math.abs(event.time - start) < SAME_TIME
  );
  if (index < 0) {
    return null;
  }
  const after = chargesOf(events[index]);
  const before = index > 0 ? chargesOf(events[index - 1]) : [];
  const charge = Math.max(
    0,
    after.findIndex(
      (time, other) => time > start && time !== (before[other] ?? 0)
    )
  );
  let end = after[charge];
  for (const event of events.slice(index + 1)) {
    if (event.time >= end) {
      break;
    }
    end = chargesOf(event)[charge] ?? end;
  }
  return { start, end: Math.min(end, duration), charge, label: use.label };
};

export const getCooldownLanes = (
  trace: RotationTraceEntry[],
  cooldowns: CooldownTrack[],
  duration: number
): CooldownLane[] =>
  LANE_KINDS.flatMap((kind) => {
    const track = cooldowns.find((cooldown) => cooldown.actionId === kind);
    if (!track) {
      return [];
    }
    // The plain E / Q only: their special forms are left out.
    const uses = trace.filter(
      (entry) =>
        entry.kind === kind &&
        !entry.performedAction &&
        entry.endTime > entry.startTime &&
        entry.startTime < duration
    );
    const charges = Math.max(
      1,
      ...track.events.map((event) => chargesOf(event).length)
    );
    return [
      {
        kind,
        charges,
        bars: uses.flatMap((use) => getBar(use, track, duration) ?? []),
      },
    ];
  });
