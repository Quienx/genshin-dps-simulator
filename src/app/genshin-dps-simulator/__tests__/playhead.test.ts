// The playhead store: writing it calls its readers only on a real change,
// and a panel's time only moves on once the playhead leaves its quantum.
import { describe, expect, it } from 'vitest';

import {
  createValueStore,
  quantizedShown,
  sameQuantum,
} from '../_components/timeline/playhead';
import {
  PANEL_QUANTUM,
  PLAYING_QUANTUM,
} from '../_components/timeline/timelineData';

describe('a value store', () => {
  it('gives its value and calls its readers on each change', () => {
    const store = createValueStore(0);
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.get()));
    store.set(1.5);
    store.set(2);
    expect(store.get()).toBe(2);
    expect(seen).toEqual([1.5, 2]);
  });

  it('calls nobody when the value stays the same', () => {
    const store = createValueStore(3);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.set(3);
    expect(calls).toBe(0);
  });

  it('stops calling a reader once it unsubscribes', () => {
    const store = createValueStore(0);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.set(1);
    unsubscribe();
    store.set(2);
    expect(calls).toBe(1);
  });
});

describe('a panel’s playhead time', () => {
  it('stays the same while the playhead is in its quantum', () => {
    const shown = { time: 1.0, quantum: PANEL_QUANTUM };
    expect(quantizedShown(shown, 1.01, PANEL_QUANTUM)).toBe(shown);
    expect(sameQuantum(1.0, 1.02, PANEL_QUANTUM)).toBe(true);
  });

  it('takes the exact time once the playhead leaves its quantum', () => {
    const shown = { time: 1.0, quantum: PANEL_QUANTUM };
    expect(quantizedShown(shown, 1.137, PANEL_QUANTUM)).toEqual({
      time: 1.137,
      quantum: PANEL_QUANTUM,
    });
  });

  it('takes the exact time when playback starts or stops (another quantum)', () => {
    const playing = { time: 4.0, quantum: PLAYING_QUANTUM };
    expect(quantizedShown(playing, 4.01, PANEL_QUANTUM)).toEqual({
      time: 4.01,
      quantum: PANEL_QUANTUM,
    });
  });

  it('follows every change with no quantum (the clock, the cursor)', () => {
    const shown = { time: 2, quantum: 0 };
    expect(quantizedShown(shown, 2, 0)).toBe(shown);
    expect(quantizedShown(shown, 2.001, 0).time).toBe(2.001);
  });
});
