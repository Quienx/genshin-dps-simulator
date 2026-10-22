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
  // The blocks shown before: when they change, the ones that left start
  // fading and the ones back stop, in this same render (React's "state
  // from the previous render" pattern: no second commit from an effect).
  const [previous, setPrevious] = useState({ key: shownKey, shown });
  const [gone, setGone] = useState<BlockChip[]>([]);
  if (previous.key !== shownKey) {
    const now = new Set(shown.map((chip) => chip.key));
    const left = previous.shown.filter((chip) => !now.has(chip.key));
    const back = Array.from(exiting.keys()).filter((key) => now.has(key));
    setPrevious({ key: shownKey, shown });
    if (left.length > 0 || back.length > 0) {
      const next = new Map(exiting);
      back.forEach((key) => next.delete(key));
      left.forEach((chip) => next.set(chip.key, chip));
      setExiting(next);
    }
    if (left.length > 0) {
      setGone(left);
    }
  }
  // Once faded out, they leave the queue.
  const exitTimers = useRef<number[]>([]);
  useEffect(() => {
    if (gone.length === 0) {
      return;
    }
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
  }, [gone]);
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
