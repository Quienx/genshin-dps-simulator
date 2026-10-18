import { afterEach, describe, expect, it } from 'vitest';

import { SET_OPTIONS, WEAPON_OPTIONS } from '../_lib/catalog';
import {
  getFileGear,
  getGearOptions,
  getLoadedCharacter,
  getLoadedVariant,
  showBuilds,
} from '../_lib/characterData';
import { toTeamActionId } from '../_lib/engine/simulateTeam';
import { parseValues, withGear } from '../_lib/simulationValues';
import { buildMemberValues, runSolo, runTeam } from '../_lib/team';

// Another weapon of the same type, and another set, the kit can wear.
const otherGear = (characterId: string) => {
  const file = getFileGear(characterId);
  const options = getGearOptions(characterId);
  return {
    weapon: options.weapons.find((option) => option.id !== file.weapon)?.id,
    artifactSet: options.sets.find((option) => option.id !== file.artifactSet)
      ?.id,
  };
};

afterEach(() => showBuilds([]));

describe('a build wearing other gear', () => {
  it('loads the character with that catalog weapon and set', () => {
    const { weapon, artifactSet } = otherGear('bennett');
    expect(weapon).toBeDefined();
    const loaded = getLoadedVariant('bennett', { weapon, artifactSet });
    const option = WEAPON_OPTIONS.find((entry) => entry.id === weapon);
    const set = SET_OPTIONS.find((entry) => entry.id === artifactSet);
    expect(loaded.character.weapon.name).toBe(option?.name);
    expect(loaded.character.artifactSet.name).toBe(set?.name);
    // The file's own character is untouched.
    expect(getLoadedCharacter('bennett').character.weapon.name).not.toBe(
      option?.name
    );
  });

  it("falls back to the file's gear for unknown ids or another weapon type", () => {
    const file = getLoadedCharacter('bennett').character;
    const catalyst = WEAPON_OPTIONS.find((entry) => entry.type === 'Catalyst');
    expect(
      getLoadedVariant('bennett', { weapon: 'no-such-weapon' }).character.weapon
        .name
    ).toBe(file.weapon.name);
    expect(
      getLoadedVariant('bennett', { weapon: catalyst?.id }).character.weapon
        .name
    ).toBe(file.weapon.name);
    expect(
      getLoadedVariant('bennett', { artifactSet: 'no-such-set' }).character
        .artifactSet.name
    ).toBe(file.artifactSet.name);
  });

  it('only offers weapons of its type and sets its kit can load', () => {
    const { weapons, sets } = getGearOptions('bennett');
    expect(weapons.length).toBeGreaterThan(0);
    weapons.forEach((option) => expect(option.type).toBe('Sword'));
    // Obsidian Codex reads Nightsoul's Blessing, which Bennett lacks.
    expect(sets.some((option) => option.id === 'obsidian-codex')).toBe(false);
    expect(
      getGearOptions('mavuika').sets.some(
        (option) => option.id === 'obsidian-codex'
      )
    ).toBe(true);
  });

  it("turns on the new entry's flags and sets its refinement", () => {
    const values = withGear(buildMemberValues('mavuika'), {
      artifactSet: 'noblesse-oblige',
    });
    const parsed = parseValues(values);
    expect(values.artifactSet).toBe('noblesse-oblige');
    expect(parsed.flags.noblesseOblige4).toBe(true);
    expect(parsed.artifactSet).toBe('noblesse-oblige');

    const { weapon } = otherGear('bennett');
    const withWeapon = withGear(buildMemberValues('bennett'), { weapon });
    const { character } = getLoadedVariant('bennett', { weapon });
    expect(withWeapon.flags[character.weapon.enabledFlag]).toBe(true);
    expect(withWeapon.numbers[character.weapon.refinementField]).toBe('1');
  });

  it("picking the file's gear again clears the override", () => {
    const file = getFileGear('bennett');
    const { weapon } = otherGear('bennett');
    const switched = withGear(buildMemberValues('bennett'), { weapon });
    const back = withGear(switched, { weapon: file.weapon });
    expect(switched.weapon).toBe(weapon);
    expect(back.weapon).toBeUndefined();
  });

  it("plays alone and in a team with the build's gear", () => {
    const base = buildMemberValues('mavuika');
    const noblesse = withGear(base, { artifactSet: 'noblesse-oblige' });
    const solo = runSolo(noblesse, 'expected');
    const blockIds = solo.members[0].activity?.blocks.map((block) => block.id);
    expect(blockIds).toContain('noblesse-2pc');
    expect(blockIds).not.toContain('obsidian-2pc');
    expect(solo.totalDamage).not.toBeCloseTo(
      runSolo(base, 'expected').totalDamage,
      0
    );

    const team = runTeam(
      {
        members: [noblesse, buildMemberValues('bennett')],
        rotation: {
          loop: false,
          blocks: [
            {
              uid: 'q',
              action: toTeamActionId('mavuika', 'normal'),
              hits: 3,
              repeat: 1,
              seconds: 1,
              dashCancel: false,
            },
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
      },
      'expected'
    );
    expect(team.members[0].activity?.blocks.map((block) => block.id)).toContain(
      'noblesse-2pc'
    );
  });

  it('the timeline reads the gear of the builds it shows', () => {
    const { weapon } = otherGear('bennett');
    const name = WEAPON_OPTIONS.find((entry) => entry.id === weapon)?.name;
    showBuilds([{ character: 'bennett', weapon }]);
    expect(getLoadedCharacter('bennett').character.weapon.name).toBe(name);
    showBuilds([]);
    expect(getLoadedCharacter('bennett').character.weapon.name).not.toBe(name);
  });
});
