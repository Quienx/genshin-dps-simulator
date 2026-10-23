import { useCallback, useEffect, useRef, useState } from 'react';

import { FRAMES_PER_SECOND } from '../../_lib/frames';

// A run, replayed: the cursor's time, played in real time × speed, and
// stepped from one moment to the next (an action or a block starting).
const usePlayback = (duration: number, stepTimes: number[]) => {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return undefined;
    }
    let handle = 0;
    const tick = (now: number) => {
      const elapsed = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setTime((current) => {
        const next = current + elapsed * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, duration]);

  const togglePlay = useCallback(() => {
    setTime((current) => (current >= duration ? 0 : current));
    setPlaying((value) => !value);
  }, [duration]);

  const stepTo = useCallback(
    (direction: 1 | -1) => {
      setPlaying(false);
      const epsilon = 1e-6;
      setTime((current) => {
        const next =
          direction === 1
            ? stepTimes.find((entry) => entry > current + epsilon)
            : [...stepTimes]
                .reverse()
                .find((entry) => entry < current - epsilon);
        return next ?? (direction === 1 ? duration : 0);
      });
    },
    [stepTimes, duration]
  );

  // Moving the cursor by hand stops playback.
  const seek = useCallback(
    (value: number) => {
      setPlaying(false);
      setTime(Math.min(duration, Math.max(0, value)));
    },
    [duration]
  );

  return { time, playing, speed, setSpeed, togglePlay, stepTo, seek };
};

export default usePlayback;

// What a key does to the player, wherever the focus is on the page: Space
// plays or pauses, ← → move a frame (Shift: a second), Home and End go to
// either end, + and − zoom.
export type PlayerKey =
  | { kind: 'toggle' }
  | { kind: 'step'; seconds: number }
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'zoom'; factor: number };

// Where the focus is, if it can say what it sits in (an Element can).
type KeyTarget = { closest?: (selector: string) => unknown } | null;

// Keys that belong to what has the focus: a field being typed in, a
// dialog or a menu.
const TYPING =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role=dialog], [role=alertdialog], [role=menu], [role=listbox]';
// Controls that Space activates and the arrows move within.
const CONTROLS =
  'button, a[href], [role=button], [role=radio], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=option], [role=slider], [role=separator]';

const within = (target: KeyTarget, selector: string) =>
  Boolean(target?.closest?.(selector));

export const playerKeyOf = (event: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: KeyTarget;
}): PlayerKey | null => {
  // Ctrl / Cmd + − is the browser's zoom; Ctrl + A, C… are edit mode's.
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (within(event.target, TYPING)) {
    return null;
  }
  const onControl = within(event.target, CONTROLS);
  switch (event.key) {
    case ' ':
      return onControl ? null : { kind: 'toggle' };
    case 'ArrowRight':
    case 'ArrowLeft': {
      if (onControl) {
        return null;
      }
      const seconds = event.shiftKey ? 1 : 1 / FRAMES_PER_SECOND;
      return {
        kind: 'step',
        seconds: event.key === 'ArrowRight' ? seconds : -seconds,
      };
    }
    case 'Home':
      return { kind: 'start' };
    case 'End':
      return { kind: 'end' };
    case '+':
    case '=':
      return { kind: 'zoom', factor: 1.25 };
    case '-':
      return { kind: 'zoom', factor: 0.8 };
    default:
      return null;
  }
};

// The player's keys on the whole page (see playerKeyOf). The latest
// callbacks and time are read when a key comes, so it listens once.
export const usePlayerShortcuts = (player: {
  time: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onZoom: (factor: number) => void;
}) => {
  const latest = useRef(player);
  latest.current = player;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const action = playerKeyOf({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: event.target instanceof Element ? event.target : null,
      });
      if (!action) {
        return;
      }
      event.preventDefault();
      const { time, duration, onTogglePlay, onSeek, onZoom } = latest.current;
      if (action.kind === 'toggle') {
        onTogglePlay();
      } else if (action.kind === 'step') {
        onSeek(time + action.seconds);
      } else if (action.kind === 'start') {
        onSeek(0);
      } else if (action.kind === 'end') {
        onSeek(duration);
      } else {
        onZoom(action.factor);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
