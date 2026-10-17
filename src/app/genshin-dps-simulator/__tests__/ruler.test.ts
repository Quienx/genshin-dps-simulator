import { describe, expect, it } from 'vitest';

import { ACTION_GAP_PX, buildRuler } from '../_components/timeline/ruler';
import { ActionPiece } from '../_lib/inspector';

// Two actions back to back: the first ends when the second starts.
const actions = [
  { start: 0, end: 1 },
  { start: 1, end: 2 },
] as ActionPiece[];

describe('timeline ruler', () => {
  const ruler = buildRuler(actions, 3, 100);

  it('leaves a gap between back-to-back actions', () => {
    const firstEnd = ruler.toX(1);
    const secondStart = ruler.toStartX(1);
    expect(secondStart - firstEnd).toBe(ACTION_GAP_PX);
  });

  it('keeps time on the axis: the gap takes no time', () => {
    expect(ruler.toX(0.5)).toBe(50);
    expect(ruler.toStartX(1.5)).toBe(150 + ACTION_GAP_PX);
    expect(ruler.toTime(ruler.toStartX(1.5))).toBeCloseTo(1.5);
    expect(ruler.totalWidth).toBe(300 + 2 * ACTION_GAP_PX);
  });

  it('places a start inside an action like toX', () => {
    expect(ruler.toStartX(0.5)).toBe(ruler.toX(0.5));
    expect(ruler.toStartX(0)).toBe(0);
  });
});
