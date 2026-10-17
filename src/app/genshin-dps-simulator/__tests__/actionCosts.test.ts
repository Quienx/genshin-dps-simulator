// What an action costs, in words, for the editor: its Energy, the forms
// that cost something else and when they apply, and what it needs.
import { describe, expect, it } from 'vitest';

import { describeActionCost, getActionCost } from '../_lib/actionCosts';

describe('action costs', () => {
  it("lists Varesa's Q: 70 Energy, Kablam 30 in Apex Drive", () => {
    const cost = getActionCost('varesa', 'burst');
    expect(cost.energy).toBe(70);
    expect(cost.forms).toEqual([
      { label: 'Volcano Kablam', energy: 30, when: 'Apex Drive' },
    ]);
  });

  it("reads a sequence (Mualani's Shark Bite) through its steps", () => {
    expect(getActionCost('mualani', 'sharkBite')).toEqual(
      getActionCost('mualani', 'normal')
    );
  });

  it('says what an action needs', () => {
    expect(getActionCost('varesa', 'plunge').requires).toBe(
      'A Plunge needs a Charged Attack right before'
    );
  });

  it('takes team action ids', () => {
    expect(getActionCost('varesa', 'varesa:burst').energy).toBe(70);
  });

  it('is nothing for a free action', () => {
    expect(describeActionCost(getActionCost('varesa', 'normal'))).toEqual([]);
  });

  it('reads as lines', () => {
    expect(describeActionCost(getActionCost('varesa', 'burst'))).toEqual([
      '70 Energy',
      'Volcano Kablam: 30 Energy (in Apex Drive)',
    ]);
  });
});
