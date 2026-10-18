// What fills each Q button: Energy, or what the Q needs instead.
import { describe, expect, it } from 'vitest';

import { getBurstCharge } from '../_lib/burstCharge';
import { getLoadedCharacter } from '../_lib/characterData';
import {
  buildPresetTeam,
  getCharacterState,
  MAVUIKA_PRESETS,
  runTeamExpected,
} from '../_lib/team';

const chargeOf = (id: string) =>
  getBurstCharge(getLoadedCharacter(id).character);

describe('a Q’s charge', () => {
  it('is its Energy, up to the Q’s cost', () => {
    expect(chargeOf('varesa')).toEqual({
      resource: 'energy',
      label: 'Energy',
      needed: 70,
      field: 'startingEnergy',
    });
  });

  it('is what the Q needs instead of Energy: Mavuika’s Fighting Spirit', () => {
    expect(chargeOf('mavuika')).toMatchObject({
      resource: 'fightingSpirit',
      needed: 100,
      field: 'startingFightingSpirit',
    });
  });

  it('is nothing when the Q needs neither', () => {
    expect(chargeOf('arlecchino')).toBeNull();
  });

  it('fills Mavuika’s Q button in the Event panel', () => {
    const run = runTeamExpected(buildPresetTeam(MAVUIKA_PRESETS[0]));
    const mavuika = run.members.find(
      (member) => member.characterId === 'mavuika'
    );
    expect(mavuika).toBeDefined();
    const state = getCharacterState(mavuika!, 0, null);
    expect(state.energy).toMatchObject({
      id: 'fightingSpirit',
      value: 200,
      needed: 100,
    });
  });
});
