import { useEffect, useMemo, useRef, useState } from 'react';

import { BlockChip } from '../../_lib/inspector';

// Seconds an instant block (a trigger firing) stays in the queue when no
// action made it.
const INSTANT_SECONDS = 2;
// How long a block that left keeps fading out.
const EXIT_MS = 300;

// A block leaves the queue when its time is over (an instant one when the
// action that made it ends, or after a moment).
const visibleUntil = (chip: BlockChip) =>
  chip.end ?? chip.until ?? chip.start + INSTANT_SECONDS;

// The blocks up at `time`, as the team inspector's queue: each joins at
// the end when it starts, stays in place while it lasts and leaves when it
// is over; one that just left stays a moment (`exiting`) so the others
// slide over instead of jumping.
const useBlockQueue = (chips: BlockChip[], time: number) => {
  const shown = chips.filter(
    (chip) =>
      !chip.hidden && chip.start <= time + 1e-6 && time < visibleUntil(chip)
  );
  const shownKey = shown.map((chip) => chip.key).join('|');
  const [exiting, setExiting] = useState<Map<string, BlockChip>>(
    () => new Map()
  );
  const previousShown = useRef<BlockChip[]>([]);
  const exitTimers = useRef<number[]>([]);
  useEffect(() => {
    const now = new Set(shown.map((chip) => chip.key));
    const gone = previousShown.current.filter((chip) => !now.has(chip.key));
    previousShown.current = shown;
    setExiting((current) => {
      const next = new Map(current);
      now.forEach((key) => next.delete(key));
      gone.forEach((chip) => next.set(chip.key, chip));
      return next;
    });
    if (gone.length > 0) {
      exitTimers.current.push(
        window.setTimeout(
          () =>
            setExiting((current) => {
              const next = new Map(current);
              gone.forEach((chip) => next.delete(chip.key));
              return next;
            }),
          EXIT_MS
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  useEffect(
    () => () => exitTimers.current.forEach((timer) => clearTimeout(timer)),
    []
  );
  // In queue order: the blocks up now and the ones leaving.
  const shownKeys = useMemo(() => new Set(shownKey.split('|')), [shownKey]);
  const queued = chips.filter(
    (chip) => shownKeys.has(chip.key) || exiting.has(chip.key)
  );
  return { queued, exiting, upNow: shown.length };
};

export default useBlockQueue;
