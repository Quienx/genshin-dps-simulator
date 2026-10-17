import { CooldownEvent, CooldownTrack } from '../types';

// Seconds left on the cooldown at `time`: the latest event before it says
// when the action is ready, and the cooldown ticks down from there.
export const getCooldownRemaining = (
  events: CooldownEvent[],
  time: number
): number => {
  const latest = events.reduce<CooldownEvent | null>(
    (found, event) => (event.time <= time ? event : found),
    null
  );
  if (!latest) {
    return 0;
  }
  return Math.max(0, latest.readyAt - time);
};

// When the cooldown running at `time` actually ends, after every cut that
// lands before it does.
export const getReadyTime = (
  events: CooldownEvent[],
  time: number
): number | null => {
  // Start from the latest event at or before `time`: on the action's own
  // piece that is the use itself, which is recorded after any cut landing
  // on the same frame.
  let firstIndex = -1;
  events.forEach((event, index) => {
    if (event.time <= time) {
      firstIndex = index;
    }
  });
  const [first, ...rest] = events.slice(Math.max(0, firstIndex));
  if (!first) {
    return null;
  }
  let readyAt = first.readyAt;
  for (const event of rest) {
    if (event.time >= readyAt) {
      break;
    }
    readyAt = event.readyAt;
  }
  return readyAt;
};

const getMaxCooldown = (events: CooldownEvent[]): number =>
  events.reduce(
    (highest, event) => Math.max(highest, event.readyAt - event.time),
    0
  );

export type PieceCooldown = {
  label: string;
  // The piece is the action itself: its full cooldown and ready time.
  isOwnAction: boolean;
  remaining: number;
  max: number;
  readyAt: number | null;
};

export const getPieceCooldown = (
  track: CooldownTrack,
  actionId: string,
  start: number
): PieceCooldown | null => {
  const max = getMaxCooldown(track.events);
  if (max <= 0) {
    return null;
  }
  const isOwnAction = actionId === track.actionId;
  return {
    label: track.label,
    isOwnAction,
    remaining: getCooldownRemaining(track.events, start),
    max,
    readyAt: isOwnAction ? getReadyTime(track.events, start) : null,
  };
};
