import { describe, expect, it } from 'vitest';

import {
  changesSpecialSystem,
  describeSystemStatus,
} from '../_components/timeline/timelineData';

describe('what belongs to a special system (Nightsoul, Bond of Life)', () => {
  it('counts a trigger that changes it', () => {
    expect(changesSpecialSystem('arlecchino', 'absorb-directive')).toBe(true);
  });

  // Arlecchino's Directive decides how much Bond of Life a Charged Attack
  // absorbs, as Fiery Passion frames Varesa's Nightsoul.
  it.each(['directive', 'bloodDebtDue', 'debtWindow'])(
    "counts Arlecchino's %s, a status that trigger depends on",
    (statusId) => {
      expect(changesSpecialSystem('arlecchino', statusId)).toBe(true);
    }
  );

  it('leaves a buff that only reads it', () => {
    expect(changesSpecialSystem('arlecchino', 'c6CritBuff')).toBe(false);
  });
});

describe("a special system's description, from the data", () => {
  it("explains Arlecchino's Bond of Life: cap, what grants it, what uses it", () => {
    const text = describeSystemStatus('arlecchino', 'bondOfLife').join('\n');
    expect(text).toMatch(/up to 200% of Max HP/);
    expect(text).toMatch(
      /Gained by:\n• Charged Attack absorbs the Directive \(\+65% or \+130%\)/
    );
    expect(text).toMatch(/• Charged Attack hit grants Bond of Life \(\+25%\)/);
    expect(text).toMatch(
      /Consumed by:\n• Masque consumes Bond of Life \(−7\.5% of it\)/
    );
    expect(text).toMatch(/• Masque of the Red Death \(at 30% or more\)/);
    expect(text).toMatch(/• Crimson Moon's Semblance \(above 0%\)/);
  });

  it("still explains Varesa's Fiery Passion", () => {
    expect(describeSystemStatus('varesa', 'nightsoulBlessing')[0]).toMatch(
      /Fiery Passion/
    );
  });
});
