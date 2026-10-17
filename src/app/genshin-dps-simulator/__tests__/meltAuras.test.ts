// Melt in a team: Cryo leaves an aura like Pyro and Electro do, and a hit
// of the other element on it melts (Pyro on Cryo ×2, Cryo on Pyro ×1.5),
// using the aura up as in gcsim's gauge theory.
import { describe, expect, it } from 'vitest';

import { block, editCharacter } from './fixtures';
import { loadCharacterFile } from '../_lib/characterData';
import { simulateTeam, toTeamActionId } from '../_lib/engine/simulateTeam';
import { buildDefaultValues, parseValues } from '../_lib/simulationValues';

// No Cryo character yet: Mualani's file as one (her Q is a Cryo hit).
const cryo = {
  characterId: 'frostdummy',
  values: parseValues(buildDefaultValues('mualani')),
  loaded: loadCharacterFile(
    editCharacter('mualani', (file) => {
      Object.assign(file, {
        id: 'frostdummy',
        name: 'Cryo Test',
        element: 'Cryo',
      });
    })
  ),
};
const nicole = {
  characterId: 'nicole',
  values: parseValues(buildDefaultValues('nicole')),
};
const play = (steps: [string, string][]) =>
  simulateTeam(
    [cryo, nicole],
    {
      loop: false,
      blocks: steps.map(([id, action], index) =>
        block(`b${index}`, toTeamActionId(id, action))
      ),
    },
    { auras: true }
  );
const hitsOf = (team: ReturnType<typeof play>, id: string) =>
  team.members.find((member) => member.characterId === id)!.context.hitLog;

describe('Melt in a team', () => {
  it('melts a Pyro hit on Cryo, ×2', () => {
    const team = play([
      ['frostdummy', 'burst'],
      ['nicole', 'skill'],
    ]);
    const melted = hitsOf(team, 'nicole').filter(
      (hit) => hit.reaction === 'Melt'
    );
    expect(melted).toHaveLength(1);
    // ×2, raised by Nicole's EM: never below 2.
    expect(melted[0].reactionMultiplier).toBeGreaterThanOrEqual(2);
  });

  it('melts a Cryo hit on Pyro, ×1.5', () => {
    const team = play([
      ['nicole', 'skill'],
      ['frostdummy', 'burst'],
    ]);
    const melted = hitsOf(team, 'frostdummy').filter(
      (hit) => hit.reaction === 'Melt'
    );
    expect(melted).toHaveLength(1);
    expect(melted[0].reactionMultiplier).toBeGreaterThanOrEqual(1.5);
    expect(melted[0].reactionMultiplier).toBeLessThan(2);
  });

  it('leaves no Melt without the other element on the enemy', () => {
    const team = play([['nicole', 'skill']]);
    expect(hitsOf(team, 'nicole').some((hit) => hit.reaction === 'Melt')).toBe(
      false
    );
  });

  it('fires reaction:Melt for party triggers', () => {
    const team = play([
      ['frostdummy', 'burst'],
      ['nicole', 'skill'],
    ]);
    const meltKeys = team.events.filter(
      (event) => event.kind === 'aura' && event.detail?.reaction === 'Melt'
    );
    expect(meltKeys).toHaveLength(1);
  });

  it('uses the aura up: one 1-unit Pyro hit takes a whole Cryo aura', () => {
    const team = play([
      ['frostdummy', 'burst'],
      ['nicole', 'normal'],
    ]);
    // Nicole's combo: the first hit melts (2 × 1 unit > 0.8 left), the
    // next ones land on a bare enemy.
    expect(
      hitsOf(team, 'nicole').filter((hit) => hit.reaction === 'Melt')
    ).toHaveLength(1);
  });
});

// gcsim's standard elemental application ICD: within a tag, a hit applies
// its element on the 1st, 4th, 7th… hit, or once 2.5 s have passed since
// the last time the count restarted.
describe('elemental application ICD', () => {
  // The Cryo dummy's Normal Attacks as Cryo hits, with or without a tag.
  const dummy = (icd: string | undefined) => ({
    characterId: 'frostdummy',
    values: parseValues(buildDefaultValues('mualani')),
    loaded: loadCharacterFile(
      editCharacter('mualani', (file) => {
        Object.assign(file, {
          id: 'frostdummy',
          name: 'Cryo Test',
          element: 'Cryo',
        });
        const normal = (
          file.talents as {
            kind?: string;
            rows: { timing?: Record<string, unknown> }[];
          }[]
        ).find((talent) => talent.kind === 'normal')!;
        normal.rows.forEach((row) => {
          if (row.timing?.action === 'normal') {
            row.timing.element = 'Cryo';
            if (icd) row.timing.icd = icd;
          }
        });
      })
    ),
  });
  const meltsOf = (icd: string | undefined) => {
    const team = simulateTeam(
      [nicole, dummy(icd)],
      {
        loop: false,
        blocks: [
          block('e', 'nicole:skill'),
          block('na', 'frostdummy:normal', { hits: 3 }),
        ],
      },
      { auras: true }
    );
    return team.members
      .find((member) => member.characterId === 'frostdummy')!
      .context.hitLog.filter((hit) => hit.reaction === 'Melt').length;
  };

  it('lets every hit apply without a tag', () => {
    // 0.8 Pyro: 1-unit Cryo hits use 0.5 each, so two of them melt.
    expect(meltsOf(undefined)).toBe(2);
  });

  it('lets only the first of three quick hits apply with one', () => {
    expect(meltsOf('normal')).toBe(1);
  });
});

// Shattering Ice (2 Cryo): +15% CRIT Rate against an enemy with Cryo on it.
describe('Shattering Ice', () => {
  const cryoMember = (id: string) => ({
    characterId: id,
    values: parseValues(buildDefaultValues('mualani')),
    loaded: loadCharacterFile(
      editCharacter('mualani', (file) => {
        Object.assign(file, { id, name: id, element: 'Cryo' });
      })
    ),
  });
  const nicoleCritOn = (members: { characterId: string }[]) => {
    const team = simulateTeam(
      [...members, nicole] as Parameters<typeof simulateTeam>[0],
      {
        loop: false,
        blocks: [
          block('q', toTeamActionId(members[0].characterId, 'burst')),
          block('e', 'nicole:skill'),
        ],
      },
      { auras: true }
    );
    return team.members.find((member) => member.characterId === 'nicole')!
      .context.hitLog[0].critRate;
  };

  it('adds 15% CRIT Rate on a Cryo-affected enemy with two Cryo members', () => {
    const one = nicoleCritOn([cryoMember('frostdummy')]);
    const two = nicoleCritOn([
      cryoMember('frostdummy'),
      cryoMember('icedummy'),
    ]);
    // The log keeps CRIT Rate as a fraction.
    expect(two - one).toBeCloseTo(0.15, 6);
  });

  it('adds nothing on an enemy without Cryo', () => {
    const team = simulateTeam(
      [cryoMember('frostdummy'), cryoMember('icedummy'), nicole],
      { loop: false, blocks: [block('e', 'nicole:skill')] },
      { auras: true }
    );
    const alone = simulateTeam(
      [nicole],
      { loop: false, blocks: [block('e', 'nicole:skill')] },
      { auras: true }
    );
    const critOf = (run: typeof team) =>
      run.members.find((member) => member.characterId === 'nicole')!.context
        .hitLog[0].critRate;
    expect(critOf(team)).toBeCloseTo(critOf(alone), 6);
  });
});
