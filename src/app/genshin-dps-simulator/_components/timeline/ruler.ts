import { ActionPiece } from '../../_lib/inspector';

// The narrowest an action can be: its icon and a gap, so icons never
// overlap.
export const MIN_ACTION_PX = 26;
// Space between back-to-back actions. It takes no time: at the instant
// one ends and the next starts, x jumps by this much.
export const ACTION_GAP_PX = 4;

export type Ruler = {
  totalWidth: number;
  // Where `time` is; at a gap, its left side (where an action ends).
  toX: (time: number) => number;
  // The same, but at a gap its right side (where the next action starts).
  toStartX: (time: number) => number;
  toTime: (x: number) => number;
};

// The timeline's axis, as in the rotation inspector: actions one after
// another, each as wide as it lasted (at least MIN_ACTION_PX). Time maps
// to x through their edges, so every row, the ticks and the cursor match
// the actions.
export const buildRuler = (
  actions: ActionPiece[],
  duration: number,
  pxPerSecond: number
): Ruler => {
  const points: [number, number][] = [[0, 0]];
  let x = 0;
  let at = 0;
  [...actions]
    .sort((first, second) => first.start - second.start)
    .forEach((action) => {
      const start = Math.max(action.start, at);
      const end = Math.max(action.end, start);
      const left = x + (start - at) * pxPerSecond;
      const width = Math.max(MIN_ACTION_PX, (end - start) * pxPerSecond);
      points.push([start, left], [end, left + width]);
      x = left + width + ACTION_GAP_PX;
      at = end;
      points.push([at, x]);
    });
  const totalWidth = x + Math.max(0, duration - at) * pxPerSecond;
  points.push([Math.max(duration, at), totalWidth]);

  const toX = (time: number) => {
    const index = points.findIndex(([t]) => t >= time);
    if (index < 0) {
      return totalWidth;
    }
    if (index === 0) {
      return 0;
    }
    const [t0, x0] = points[index - 1];
    const [t1, x1] = points[index];
    return t1 === t0 ? x0 : x0 + ((time - t0) / (t1 - t0)) * (x1 - x0);
  };
  const toStartX = (time: number) => {
    let index = -1;
    points.forEach(([t], i) => {
      if (t <= time) {
        index = i;
      }
    });
    if (index < 0) {
      return 0;
    }
    if (index === points.length - 1) {
      return points[index][1];
    }
    const [t0, x0] = points[index];
    const [t1, x1] = points[index + 1];
    return t1 === t0 ? x0 : x0 + ((time - t0) / (t1 - t0)) * (x1 - x0);
  };
  const toTime = (position: number) => {
    const index = points.findIndex(([, px]) => px >= position);
    if (index < 0) {
      return duration;
    }
    if (index === 0) {
      return 0;
    }
    const [t0, x0] = points[index - 1];
    const [t1, x1] = points[index];
    return x1 === x0 ? t1 : t0 + ((position - x0) / (x1 - x0)) * (t1 - t0);
  };
  return { totalWidth, toX, toStartX, toTime };
};

// The zoom (px per second) whose ruler best fills `width`; never below
// `min` (with many actions, their minimum widths alone may not fit).
export const fitPxPerSecond = (
  actions: ActionPiece[],
  duration: number,
  width: number,
  min: number,
  max: number
): number => {
  let low = min;
  let high = max;
  if (buildRuler(actions, duration, low).totalWidth >= width) {
    return low;
  }
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2;
    if (buildRuler(actions, duration, middle).totalWidth > width) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return low;
};
