// The chart draws a line where each batch of particles is caught, so a
// Q can be put after its Energy lands.
import { describe, expect, it } from 'vitest';

import { particleArrivals } from '../_components/timeline/timelineData';
import { buildInspectorView } from '../_lib/inspector';
import { buildDefaultTeam, runTeam } from '../_lib/team';

const view = buildInspectorView(runTeam(buildDefaultTeam(), 'expected'));

describe('particle arrivals', () => {
  it("puts Nicole's E particles where they are caught, not where made", () => {
    const nicole = particleArrivals(view).find(
      (arrival) => arrival.characterId === 'nicole'
    )!;
    // Her E at 1.68 s; they fly 100 frames.
    expect(nicole.time).toBeCloseTo(1.68 + 100 / 60, 1);
    expect(nicole.element).toBe('Pyro');
    expect(nicole.count).toBe(5);
  });

  it('is in time order', () => {
    const times = particleArrivals(view).map((arrival) => arrival.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
