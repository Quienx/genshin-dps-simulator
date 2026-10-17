// Events of a simulation, run in frame order; events on the same frame run
// in the order they were scheduled.
export type EventQueue = {
  push: (frame: number, run: (frame: number) => void) => void;
  // Runs every event up to `upToFrame` (inclusive), including ones scheduled
  // while running. Events at or after `endFrame` are dropped.
  runUntil: (upToFrame: number, endFrame: number) => void;
  // Frame of the earliest pending event, null when there is none.
  nextFrame: () => number | null;
  // The furthest frame events have been run to.
  ranUntil: () => number;
};

type QueuedEvent = {
  frame: number;
  seq: number;
  run: (frame: number) => void;
};

const isEarlier = (first: QueuedEvent, second: QueuedEvent): boolean =>
  first.frame < second.frame ||
  (first.frame === second.frame && first.seq < second.seq);

export const createEventQueue = (): EventQueue => {
  const events: QueuedEvent[] = [];
  let nextSeq = 0;
  let ranUntil = 0;

  const takeNext = (upToFrame: number): QueuedEvent | null => {
    let bestIndex = -1;
    events.forEach((event, index) => {
      if (event.frame > upToFrame) {
        return;
      }
      if (bestIndex < 0 || isEarlier(event, events[bestIndex])) {
        bestIndex = index;
      }
    });
    if (bestIndex < 0) {
      return null;
    }
    return events.splice(bestIndex, 1)[0];
  };

  return {
    nextFrame: () =>
      events.length === 0
        ? null
        : events.reduce(
            (earliest, event) => Math.min(earliest, event.frame),
            Number.POSITIVE_INFINITY
          ),
    push: (frame, run) => {
      events.push({ frame, seq: nextSeq, run });
      nextSeq += 1;
    },
    ranUntil: () => ranUntil,
    runUntil: (upToFrame, endFrame) => {
      ranUntil = Math.max(ranUntil, Math.min(upToFrame, endFrame));
      for (;;) {
        const event = takeNext(upToFrame);
        if (!event) {
          return;
        }
        if (event.frame < endFrame) {
          event.run(event.frame);
        }
      }
    },
  };
};
