import { describe, expect, it } from 'vitest';

import { block, createFileRuntime, editCharacter } from './fixtures';
import { getLoadedCharacter } from '../_lib/characterData';
import { CHARACTER_LIST } from '../_lib/characters';
import { createDamageContext } from '../_lib/damageEngine';
import { simulateLoadedCharacter } from '../_lib/engine/simulateKit';
import {
  simulateTeam,
  SWAP_COOLDOWN_FRAMES,
  toTeamActionId,
} from '../_lib/engine/simulateTeam';
import { getMemberStyle } from '../_lib/rotation/memberStyles';
import { RotationBlock } from '../_lib/rotation/types';
import {
  buildDefaultValues,
  parseValues,
  withRotation,
} from '../_lib/simulationValues';
import {
  buildMemberValues,
  getTeamActions,
  getTeamPaletteGroups,
  runSolo,
} from '../_lib/team';

const member = (
  characterId: string,
  flags: Record<string, boolean> = {},
  numbers: Record<string, string> = {}
) => {
  const defaults = buildDefaultValues(characterId);
  return {
    characterId,
    values: parseValues({
      ...defaults,
      numbers: { ...defaults.numbers, duration: '20', ...numbers },
      flags: { ...defaults.flags, ...flags },
    }),
  };
};

// A block of a member's action.
const step = (
  characterId: string,
  action: string,
  options: Partial<RotationBlock> = {}
) =>
  block(
    `${characterId}-${action}-${Math.random()}`,
    toTeamActionId(characterId, action),
    options
  );

const rotation = (blocks: RotationBlock[]) => ({ loop: false, blocks });

const frameOf = (seconds: number) => Math.round(seconds * 60);

describe('a team of one', () => {
  it.each(['varesa', 'mualani', 'nicole'])(
    'deals what %s deals alone with the same rotation',
    (characterId) => {
      const actions = ['skill', 'charged', 'normal', 'burst', 'normal'];
      const solo = (() => {
        const values = parseValues(
          withRotation(
            {
              ...buildDefaultValues(characterId),
              numbers: {
                ...buildDefaultValues(characterId).numbers,
                duration: '20',
              },
            },
            {
              loop: true,
              blocks: actions.map((action, index) =>
                block(`b${index}`, action)
              ),
            }
          )
        );
        const context = createDamageContext(values, 'expected');
        simulateLoadedCharacter(
          getLoadedCharacter(characterId),
          context,
          values
        );
        return context.totalDamage;
      })();
      const team = simulateTeam([member(characterId)], {
        loop: true,
        blocks: actions.map((action) => step(characterId, action)),
      });
      expect(solo).toBeGreaterThan(0);
      expect(team.totalDamage).toBeCloseTo(solo, 6);
    }
  );
});

describe('a team of one without a rotation', () => {
  it.each(CHARACTER_LIST.map((character) => character.id))(
    "plays %s's automatic list, as alone",
    (characterId) => {
      const values = member(characterId).values;
      const context = createDamageContext(values, 'expected');
      simulateLoadedCharacter(getLoadedCharacter(characterId), context, values);
      const team = simulateTeam([member(characterId)], null);
      expect(context.totalDamage).toBeGreaterThan(0);
      expect(team.totalDamage).toBeCloseTo(context.totalDamage, 6);
      expect(team.swaps).toHaveLength(1);
    }
  );

  // The inspector finds an action's hits by its step: an automatic step
  // needs an id of its own, as a rotation block has.
  it.each(CHARACTER_LIST.map((character) => character.id))(
    "ties each of %s's hits to the automatic step that dealt it",
    (characterId) => {
      const run = runSolo(buildMemberValues(characterId), 'expected');
      const steps = new Set(run.trace.map((entry) => entry.blockUid));
      // An action's own hits (a Directive tick or an Arcane Projection is
      // made by a status or a trigger: no step, with a rotation too).
      const hits = run.members[0].hitLog.filter((hit) =>
        ['Normal', 'Charged', 'Plunge', 'Skill', 'Burst'].includes(hit.category)
      );
      expect(steps.has('')).toBe(false);
      expect(steps.size).toBe(run.trace.length);
      expect(hits.length).toBeGreaterThan(0);
      hits.forEach((hit) => expect(steps.has(hit.blockUid ?? '')).toBe(true));
    }
  );

  it.each(CHARACTER_LIST.map((character) => character.id))(
    "runs %s as its own screen does (the timeline's single characters)",
    (characterId) => {
      const values = buildMemberValues(characterId);
      const context = createDamageContext(parseValues(values), 'expected');
      simulateLoadedCharacter(
        getLoadedCharacter(characterId),
        context,
        parseValues(values)
      );
      expect(runSolo(values, 'expected').totalDamage).toBeCloseTo(
        context.totalDamage,
        6
      );
    }
  );
});

describe('swaps', () => {
  it('waits for the swap cooldown and the end of the previous action', () => {
    const team = simulateTeam(
      [member('nicole'), member('chevreuse')],
      rotation([
        step('nicole', 'skill'),
        step('chevreuse', 'skill'),
        step('nicole', 'normal'),
      ])
    );
    const starts = team.rotationTrace.map((entry) => frameOf(entry.startTime));
    // Nicole's E ends at 40; Chevreuse swaps in then. Back to Nicole only
    // after Chevreuse's E (31) and 1 s since the last swap.
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(40);
    expect(starts[2]).toBe(40 + Math.max(31, SWAP_COOLDOWN_FRAMES));
    expect(team.swaps.map((swap) => swap.characterId)).toEqual([
      'nicole',
      'chevreuse',
      'nicole',
    ]);
  });

  // gcsim's swap_delay: the swap takes that long; the member comes in (and
  // the 1 s swap cooldown starts) once it is done.
  it('takes the swap delay to bring the next member in', () => {
    const team = simulateTeam(
      [member('nicole'), member('chevreuse')],
      rotation([
        step('nicole', 'skill'),
        step('chevreuse', 'skill'),
        step('nicole', 'normal'),
      ]),
      { swapDelayFrames: 12 }
    );
    const starts = team.rotationTrace.map((entry) => frameOf(entry.startTime));
    expect(starts[0]).toBe(0);
    // Swap pressed at 40 (end of Nicole's E), Chevreuse in at 52.
    expect(starts[1]).toBe(40 + 12);
    // Back to Nicole: pressed 1 s after Chevreuse came in, in 12 later.
    expect(starts[2]).toBe(52 + SWAP_COOLDOWN_FRAMES + 12);
    expect(team.swaps.map((swap) => swap.frame)).toEqual([0, 52, 124]);
  });

  it('never delays the first member, nor a team of one', () => {
    const team = simulateTeam(
      [member('nicole')],
      rotation([step('nicole', 'skill'), step('nicole', 'normal')]),
      { swapDelayFrames: 12 }
    );
    expect(frameOf(team.rotationTrace[0].startTime)).toBe(0);
    expect(team.swaps).toHaveLength(1);
  });

  it('swaps to a Wait’s member like any step', () => {
    const team = simulateTeam(
      [member('nicole'), member('chevreuse')],
      rotation([
        step('nicole', 'skill'),
        step('chevreuse', 'wait', { seconds: 1 }),
        step('nicole', 'normal'),
      ])
    );
    expect(team.swaps).toHaveLength(3);
  });
});

describe('team buffs', () => {
  it("adds Iansan's Scale to the active member's hits, from her ATK", () => {
    const team = simulateTeam(
      [member('iansan'), member('varesa')],
      rotation([
        step('iansan', 'skill'),
        step('iansan', 'burst'),
        step('varesa', 'normal', { hits: 3 }),
      ])
    );
    const varesa = team.members.find((m) => m.characterId === 'varesa');
    const buffed = varesa?.context.hitLog.filter((hit) =>
      hit.effectIds?.includes('iansan/scale-atk-party')
    );
    expect(buffed?.length).toBeGreaterThan(0);
  });

  it('never gives a member its own team buffs', () => {
    const team = simulateTeam(
      [member('iansan'), member('varesa')],
      rotation([step('iansan', 'skill'), step('iansan', 'burst')])
    );
    const iansan = team.members.find((m) => m.characterId === 'iansan');
    expect(
      iansan?.context.hitLog.some((hit) =>
        hit.effectIds?.some((id) => id.startsWith('iansan/'))
      )
    ).toBe(false);
  });
});

describe('party triggers', () => {
  it("makes Nicole's Arcane Projections with the attacker's ATK and element", () => {
    const team = simulateTeam(
      [member('nicole'), member('varesa')],
      rotation([
        step('nicole', 'burst'),
        step('varesa', 'normal', { hits: 3 }),
        step('varesa', 'normal', { hits: 3 }),
      ])
    );
    const [nicole, varesa] = team.members;
    const projections = varesa.context.hitLog.filter(
      (hit) => hit.category === 'Arcane Projection'
    );
    expect(projections.length).toBeGreaterThan(0);
    expect(projections.every((hit) => hit.element === 'Electro')).toBe(true);
    expect(
      nicole.context.hitLog.some((hit) => hit.category === 'Arcane Projection')
    ).toBe(false);
  });

  it("gives Chevreuse an Overcharged Ball from another member's Overloaded", () => {
    const team = simulateTeam(
      [
        member('chevreuse', { overloaded: false }),
        member('varesa', { teamOverloaded: true }),
      ],
      rotation([
        step('varesa', 'normal', { hits: 3 }),
        step('chevreuse', 'skillHold'),
      ])
    );
    const [chevreuse, varesa] = team.members;
    expect(
      varesa.context.hitLog.some((hit) => hit.category === 'Overloaded')
    ).toBe(true);
    expect(
      team.rotationTrace.find(
        (entry) => entry.action === toTeamActionId('chevreuse', 'skillHold')
      )?.performedAction
    ).toBe(toTeamActionId('chevreuse', 'overchargedBall'));
    expect(chevreuse.activity?.statuses.chevreuseShred?.length).toBeGreaterThan(
      0
    );
  });
});

describe('filling while a teammate recharges', () => {
  const play = (fillWhileWaiting: boolean) =>
    simulateTeam(
      [member('varesa'), member('nicole')],
      rotation([
        step('nicole', 'skill'),
        step('varesa', 'normal'),
        step('nicole', 'skill'),
      ]),
      { fillWhileWaiting }
    );

  it('waits on the field without it', () => {
    const { rotationTrace } = play(false);
    const secondE = rotationTrace.filter(
      (entry) => entry.action === toTeamActionId('nicole', 'skill')
    )[1];
    expect(secondE?.warning).toMatch(/Waited/);
  });

  it('keeps the member on the field attacking until the E is ready', () => {
    const { rotationTrace } = play(true);
    const skills = rotationTrace.filter(
      (entry) => entry.action === toTeamActionId('nicole', 'skill')
    );
    // Nicole's E is ready 16 s after the first one.
    expect(frameOf(skills[1].startTime)).toBeGreaterThanOrEqual(960);
    expect(skills[1].warning).toBeNull();
    const fillers = rotationTrace.filter(
      (entry) =>
        entry.blockUid === '' &&
        entry.action.startsWith('varesa:') &&
        entry.startTime < skills[1].startTime
    );
    expect(fillers.length).toBeGreaterThan(5);
  });
});

describe('particles in a team', () => {
  // Iansan's E makes 4 Electro particles, caught 100 frames later; Varesa
  // (Electro, 133% ER) is on the field by then.
  const energyOf = (team: ReturnType<typeof simulateTeam>, id: string) => {
    const log =
      team.members.find((m) => m.characterId === id)?.activity?.resources
        .energy ?? [];
    return log[log.length - 1]?.value ?? 0;
  };
  const play = () =>
    simulateTeam(
      [
        // Only the E's particles: no C1, Scroll 2-piece, Favonius or High
        // Voltage (no Overloaded) Energy.
        member(
          'iansan',
          { favonius: false, c1: false, scroll2: false, overloaded: false },
          { startingEnergy: '0' }
        ),
        member('varesa', {}, { startingEnergy: '0' }),
      ],
      // One Normal Attack hit: a catalyst's first restores no Energy.
      rotation([step('iansan', 'skill'), step('varesa', 'normal')])
    );

  it('gives the member on the field the full Energy', () => {
    // Same element: 3 Energy a particle × 133% ER.
    expect(energyOf(play(), 'varesa')).toBeCloseTo(4 * 3 * 1.33, 6);
  });

  it('gives the others 60%', () => {
    // Iansan swapped out: 4 × 3 × 60% × 192.1% ER.
    expect(energyOf(play(), 'iansan')).toBeCloseTo(4 * 3 * 0.6 * 1.921, 6);
  });
});

describe('swapping in and out', () => {
  it("keeps Varesa's Lost Prayer stacks off the field, as the game does", () => {
    // In-game: back on the field at ~5 s after her first swap she shows 2
    // stacks (24% Hydro DMG at R3), gained every 4 s of combat.
    const team = simulateTeam(
      [member('varesa'), member('nicole')],
      rotation([
        step('varesa', 'normal'),
        step('nicole', 'skill'),
        step('nicole', 'normal', { hits: 3 }),
        step('nicole', 'normal', { hits: 3 }),
        step('nicole', 'normal', { hits: 3 }),
        step('varesa', 'normal'),
      ])
    );
    const varesa = team.members.find((m) => m.characterId === 'varesa');
    const back = varesa?.context.hitLog.at(-1);
    expect(back?.time).toBeGreaterThan(4);
    expect(back?.notes).toMatch(/Lost Prayer to the Sacred Winds 1 stacks/);
  });

  it('keeps a character alone on the field', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push({
        id: 'probe-field',
        type: 'trigger',
        source: 'talent',
        label: 'Probe',
        when: { use: 'probe' },
        if: { onField: true },
        do: [{ count: 'onField' }],
      });
    });
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probe'], 0, null);
    expect(runtime.getCounter('count:onField')).toBe(1);
  });
});

describe("Iansan's Kinetic Energy Scale", () => {
  it('buffs her own Q hit when she casts it at 42+ points (gcsim)', () => {
    const team = simulateTeam(
      [member('iansan')],
      rotation([step('iansan', 'skill'), step('iansan', 'burst')])
    );
    const qHit = team.members[0].context.hitLog.find(
      (hit) => hit.actionId === 'burst'
    );
    expect(qHit?.effectIds).toContain('scale-atk');
  });
});

describe('elemental resonance', () => {
  it('gives the team +25% ATK with 2 Pyro members (Fervent Flames)', () => {
    const play = (ids: string[]) =>
      simulateTeam(
        ids.map((id) => member(id)),
        rotation([step('varesa', 'skill')])
      ).members.find((m) => m.characterId === 'varesa')!.context.hitLog[0];
    const withPyro = play(['varesa', 'chevreuse', 'nicole']);
    const onePyro = play(['varesa', 'chevreuse']);
    expect(withPyro.effectIds).toContain('resonance/fervent-flames');
    expect(onePyro.effectIds).not.toContain('resonance/fervent-flames');
    // 25% of her base ATK (356 + 608 Lost Prayer).
    expect((withPyro.stat ?? 0) - (onePyro.stat ?? 0)).toBeCloseTo(
      0.25 * 964,
      6
    );
  });

  it('makes an Electro particle on Overloaded with 2 Electro members (High Voltage), once every 5 s', () => {
    const energyOf = (ids: string[]) => {
      const team = simulateTeam(
        ids.map((id) =>
          member(id, id === 'varesa' ? { teamOverloaded: true } : {}, {
            startingEnergy: '0',
          })
        ),
        rotation([step('varesa', 'normal', { hits: 3 })])
      );
      const log =
        team.members.find((m) => m.characterId === 'varesa')?.activity
          ?.resources.energy ?? [];
      return log[log.length - 1]?.value ?? 0;
    };
    // Varesa on the field: an Electro particle is 3 Energy × 133% ER.
    expect(
      energyOf(['varesa', 'iansan']) - energyOf(['varesa', 'chevreuse'])
    ).toBeGreaterThanOrEqual(3 * 1.33 - 1e-6);
  });
});

describe('team buffs from the giver’s ATK at the moment', () => {
  // Varesa's E right after the supports, as in the game test.
  const team = simulateTeam(
    ['varesa', 'iansan', 'chevreuse', 'nicole'].map((id) =>
      member(id, id === 'varesa' ? { teamOverloaded: true } : {})
    ),
    rotation([
      step('nicole', 'skill'),
      step('chevreuse', 'burst'),
      step('chevreuse', 'skillHold'),
      step('iansan', 'skill'),
      step('iansan', 'burst'),
      step('varesa', 'skill'),
    ])
  );
  const varesaHit = team.members.find((m) => m.characterId === 'varesa')!
    .context.hitLog[0];
  const noteOf = (label: RegExp) =>
    varesaHit.notes.split('; ').find((note) => label.test(note));

  it("values Iansan's Scale from her ATK with resonance, A4 and A1 (capped at 810)", () => {
    // 27% × (2,680 + 205 + 329 + 164) = 912 → the Lv. 13 cap.
    expect(noteOf(/Ardent Support/)).toMatch(/\+810 ATK$/);
  });

  it("values Nicole's Grace of Kenosis the same way (capped at 600)", () => {
    // 15% × (3,904 + 271 + 433) = 691 → the Lv. 10 cap.
    expect(noteOf(/Grace of Kenosis/)).toMatch(/\+600 ATK$/);
  });
});
describe('Pyro and Electro auras', () => {
  const overloadedOf = (team: ReturnType<typeof simulateTeam>, id: string) =>
    team.members
      .find((m) => m.characterId === id)!
      .context.hitLog.filter((hit) => hit.category === 'Overloaded');
  // No member's own Overloaded option: only the auras make them.
  const plain = (id: string) =>
    member(id, { overloaded: false, teamOverloaded: false });

  it('makes no Overloaded without the other element on the enemy', () => {
    const team = simulateTeam(
      [plain('varesa'), plain('nicole')],
      rotation([step('varesa', 'normal', { hits: 3 })]),
      { auras: true }
    );
    expect(overloadedOf(team, 'varesa')).toHaveLength(0);
  });

  it("triggers Overloaded with Varesa's Electro hit on Nicole's Pyro", () => {
    const team = simulateTeam(
      [plain('nicole'), plain('varesa')],
      rotation([step('nicole', 'skill'), step('varesa', 'normal')]),
      { auras: true }
    );
    expect(overloadedOf(team, 'varesa')).toHaveLength(1);
  });

  it('uses the aura up: Electro hits stop reacting once the Pyro is gone', () => {
    const team = simulateTeam(
      [plain('nicole'), plain('varesa')],
      rotation([
        step('nicole', 'skill'),
        step('varesa', 'normal', { hits: 3 }),
        step('varesa', 'normal', { hits: 3 }),
      ]),
      { auras: true }
    );
    // A 1-unit E leaves 0.8 units: the first 1-unit Electro hit takes it.
    expect(overloadedOf(team, 'varesa')).toHaveLength(1);
  });

  it("makes the enemy's aura with the first element, then reacts to the other", () => {
    const team = simulateTeam(
      [plain('varesa'), plain('nicole')],
      rotation([step('varesa', 'skill'), step('nicole', 'skill')]),
      { auras: true }
    );
    // Varesa's Electro first, then Nicole's Pyro on it.
    expect(overloadedOf(team, 'nicole')).toHaveLength(1);
  });
});

describe("Iansan's C4 (another member's Q)", () => {
  it('gets 2 Surging Force stacks when Varesa uses her Q during the Scale', () => {
    const team = simulateTeam(
      [member('iansan'), member('varesa', {}, { startingEnergy: '70' })],
      rotation([
        step('iansan', 'skill'),
        step('iansan', 'burst'),
        step('varesa', 'burst'),
      ])
    );
    const iansan = team.members.find((m) => m.characterId === 'iansan');
    const stacks = iansan?.activity?.resources.surgingForce ?? [];
    expect(stacks.some((change) => change.value === 2)).toBe(true);
  });
});

describe('team palette colors', () => {
  const ids = ['varesa', 'iansan', 'chevreuse', 'nicole'];

  it('gives each member its slot and avatar', () => {
    const groups = getTeamPaletteGroups(ids, getTeamActions(ids));
    expect(groups.map((group) => group.slot)).toEqual([0, 1, 2, 3]);
    groups.forEach((group) =>
      expect(group.avatar).toMatch(/^https?:\/\/.+\.png$/)
    );
  });

  it('colors the four slots differently', () => {
    const chips = [0, 1, 2, 3].map((slot) => getMemberStyle(slot).chip);
    expect(new Set(chips).size).toBe(4);
  });
});

describe("Chevreuse's C6 stacks", () => {
  // Each heal of her E gives a stack to whoever is on the field then, and
  // each member keeps its own (gcsim: c6StackCounts per character).
  const run = () =>
    simulateTeam(
      [member('chevreuse'), member('iansan'), member('varesa')],
      rotation([
        step('chevreuse', 'skillHold'),
        // On the field for the first heal (about 2.3 s after the E).
        step('iansan', 'wait', { seconds: 2 }),
        // In before the second heal: none of the stacks are hers yet.
        step('varesa', 'skill'),
        step('varesa', 'wait', { seconds: 4 }),
        step('varesa', 'skill'),
      ]),
      { auras: true }
    );
  const varesaSkillHits = () =>
    run()
      .members.find((result) => result.characterId === 'varesa')!
      .context.hitLog.filter((hit) => hit.actionId === 'skill');
  const hasC6 = (hit: { effectIds?: string[] }) =>
    (hit.effectIds ?? []).includes('chevreuse/c6-dmg-party');

  it('does not give the next member a stack healed onto another', () => {
    const [first] = varesaSkillHits();
    expect(hasC6(first)).toBe(false);
  });

  it('gives a stack to the member healed while on the field', () => {
    const hits = varesaSkillHits();
    expect(hasC6(hits[hits.length - 1])).toBe(true);
  });
});
