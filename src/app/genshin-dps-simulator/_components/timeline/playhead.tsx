import {
  ComponentType,
  createContext,
  memo,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';

import { PANEL_QUANTUM, PLAYING_QUANTUM, sameShownProps } from './timelineData';

// A value kept outside React state, that components subscribe to (a
// zustand store's pattern, in a few lines). Writing it redraws nothing by
// itself: each reader redraws on its own, and only when what it reads
// changes. The playhead's time is one: it moves on every frame of a
// playback, and only the clock, the slider and the playhead's line need
// every frame.
export type ValueStore<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export type PlayheadStore = ValueStore<number>;

export const createValueStore = <T,>(initial: T): ValueStore<T> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) {
        return;
      }
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

// The store's value, redrawn on every change.
export const useStoreValue = <T,>(store: ValueStore<T>): T =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

// Calls `effect` on every change, outside React's render (the view that
// follows the playhead): nothing is redrawn for it.
export const useStoreEffect = <T,>(
  store: ValueStore<T>,
  effect: (value: T) => void
) => {
  const latest = useRef(effect);
  latest.current = effect;
  useEffect(() => store.subscribe(() => latest.current(store.get())), [store]);
};

// Whether two times fall in the same quantum (s) of the playhead.
export const sameQuantum = (a: number, b: number, quantum: number) =>
  quantum <= 0 ? a === b : Math.round(a / quantum) === Math.round(b / quantum);

// What a panel shows of the playhead now at `time`: the time it shows
// (the same object) while the playhead stays in its quantum, else the
// exact new time (also when the quantum changes, as playback starts or
// stops).
export type ShownTime = { time: number; quantum: number };
export const quantizedShown = (
  shown: ShownTime,
  time: number,
  quantum: number
): ShownTime =>
  shown.quantum === quantum && sameQuantum(shown.time, time, quantum)
    ? shown
    : { time, quantum };

// The playhead's time as a panel reads it (see quantizedShown): within a
// quantum, the panel is not redrawn.
export const useQuantizedTime = (
  playhead: PlayheadStore,
  quantum: number
): number => {
  const shown = useRef<ShownTime>({ time: playhead.get(), quantum });
  const snapshot = () => {
    shown.current = quantizedShown(shown.current, playhead.get(), quantum);
    return shown.current.time;
  };
  return useSyncExternalStore(playhead.subscribe, snapshot, snapshot);
};

// A panel that follows the playhead without its parent redrawing: it
// subscribes to the playhead itself and gets its `time` at most once per
// quantum (coarser while `playing`). Otherwise it redraws only when
// another prop changes (callbacks count as the same).
export const withPlayheadTime = <P extends { time: number; playing?: boolean }>(
  Panel: ComponentType<P>
) => {
  const Live = ({
    playhead,
    ...props
  }: Omit<P, 'time'> & { playhead: PlayheadStore }) => {
    const time = useQuantizedTime(
      playhead,
      props.playing ? PLAYING_QUANTUM : PANEL_QUANTUM
    );
    return <Panel {...(props as unknown as P)} time={time} />;
  };
  Live.displayName = `Live(${Panel.displayName ?? Panel.name ?? 'Panel'})`;
  return memo(Live, sameShownProps);
};

// The page's playhead store, for readers deep inside a panel (an Active
// Effects row's meter). The store itself never changes, so providing it
// redraws nothing: each reader subscribes to the time on its own.
const PlayheadContext = createContext<PlayheadStore | null>(null);
export const PlayheadProvider = PlayheadContext.Provider;
export const usePlayheadStore = (): PlayheadStore => {
  const store = useContext(PlayheadContext);
  if (!store) {
    throw new Error('usePlayheadStore needs a PlayheadProvider above it');
  }
  return store;
};
