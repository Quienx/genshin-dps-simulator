import { meetsBounds } from './engine/runtime';

type Bounds = { gt?: number; gte?: number; lt?: number; lte?: number };
type Span = { start: number; end: number };

// What a run logged of its state (a member's ActivityLog, or part of it).
type StateLog = {
  resources: Record<string, { frame: number; value: number }[]>;
  statuses: Record<string, Span[]>;
  stacks: Record<string, Span[]>;
};

// A state value at `frame`, as the engine reads it for a `while`: a
// resource's value, a stack status' count, 1 while a status is up.
const valueAt = (log: StateLog, id: string, frame: number): number => {
  const changes = log.resources[id];
  if (changes) {
    let value = 0;
    changes.forEach((change) => {
      if (change.frame <= frame) {
        value = change.value;
      }
    });
    return value;
  }
  const up = (span: Span) => span.start <= frame && frame < span.end;
  const stacks = log.stacks[id];
  if (stacks) {
    return stacks.filter(up).length;
  }
  return (log.statuses[id] ?? []).some(up) ? 1 : 0;
};

// The frames a bonus' `while` holds in a run ([start, end), up to
// `endFrame`): every condition at once. It can only change where one of
// the states it reads changes.
export const conditionSpans = (
  conditions: Record<string, Bounds>,
  log: StateLog,
  endFrame: number
): Span[] => {
  const ids = Object.keys(conditions);
  const changes = new Set<number>([0]);
  ids.forEach((id) => {
    (log.resources[id] ?? []).forEach((change) => changes.add(change.frame));
    [...(log.stacks[id] ?? []), ...(log.statuses[id] ?? [])].forEach((span) => {
      changes.add(span.start);
      changes.add(span.end);
    });
  });
  const frames = Array.from(changes)
    .filter((frame) => frame < endFrame)
    .sort((first, second) => first - second);
  const spans: Span[] = [];
  let openedAt: number | null = null;
  frames.forEach((frame) => {
    const holds = ids.every((id) =>
      meetsBounds(valueAt(log, id, frame), conditions[id])
    );
    if (holds && openedAt === null) {
      openedAt = frame;
    } else if (!holds && openedAt !== null) {
      spans.push({ start: openedAt, end: frame });
      openedAt = null;
    }
  });
  if (openedAt !== null) {
    spans.push({ start: openedAt, end: endFrame });
  }
  return spans;
};
