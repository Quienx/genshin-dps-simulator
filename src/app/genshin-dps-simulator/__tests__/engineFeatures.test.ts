import { describe, expect, it } from 'vitest';

import {
  block,
  createFileRuntime,
  editCharacter,
  findTalent,
  simulateFile,
} from './fixtures';
import { getLoadedCharacter, loadCharacterFile } from '../_lib/characterData';
import { expandSystems } from '../_lib/engine/modules';
import { simulateTeam, toTeamActionId } from '../_lib/engine/simulateTeam';
import formatNumber from '../_lib/formatNumber';
import { buildDefaultValues, parseValues } from '../_lib/simulationValues';
import { getRowMultiplier } from '../_lib/talents';
import { buildMemberValues, createTeamBlock, runTeam } from '../_lib/team';

const startsOf = (
  trace: { action: string; startTime: number; warning: string | null }[],
  action: string
) =>
  trace
    .filter((entry) => entry.action === action && !entry.warning?.match(/^Not/))
    .map((entry) => Math.round(entry.startTime * 60));

describe('cooldown charges', () => {
  // Arlecchino's E with 2 charges of 600 frames.
  const file = editCharacter('arlecchino', (character) => {
    findTalent(character, 'elementalSkill').cooldown = {
      frames: 600,
      delayFrames: 0,
      charges: 2,
    };
  });

  it('uses the second charge at once and recharges one at a time', () => {
    const { trace } = simulateFile(file, {
      blocks: [
        block('e1', 'skill'),
        block('e2', 'skill'),
        block('e3', 'skill'),
        block('e4', 'skill'),
      ],
    });
    // E ends at frame 77: the second charge is used right away, the third
    // E waits for the first charge (600), the fourth for the second, which
    // only started recharging when the first was back (1200).
    expect(startsOf(trace, 'skill')).toEqual([0, 77, 600, 1200]);
  });

  it('keeps a single charge working as before', () => {
    const single = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').cooldown = {
        frames: 600,
        delayFrames: 0,
      };
    });
    const { trace } = simulateFile(single, {
      blocks: [block('e1', 'skill'), block('e2', 'skill')],
    });
    expect(startsOf(trace, 'skill')).toEqual([0, 600]);
  });
});

describe('talent forms', () => {
  // Arlecchino's E turns into a Cryo "form" skill while the flag is on.
  const skillForm = (cooldown?: unknown) =>
    editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').forms = [
        {
          id: 'formSkill',
          label: 'Form skill',
          shortLabel: 'FE',
          while: { flag: 'formOn' },
          element: 'Cryo',
          end: 30,
          hits: [{ row: 'elementalSkill/skill-spike', frame: 5 }],
          ...(cooldown === undefined ? {} : { cooldown }),
        },
      ];
    });
  const threeSkills = [
    block('e1', 'skill'),
    block('e2', 'skill'),
    block('e3', 'skill'),
  ];

  it('performs the form while its condition holds, with its element', () => {
    const { trace, context } = simulateFile(skillForm('none'), {
      blocks: threeSkills,
      flags: { formOn: true },
    });
    expect(trace.map((entry) => entry.performedAction)).toEqual([
      'formSkill',
      'formSkill',
      'formSkill',
    ]);
    expect(trace.map((entry) => entry.label)).toEqual(['FE', 'FE', 'FE']);
    // No cooldown: one after the other.
    expect(startsOf(trace, 'skill')).toEqual([0, 30, 60]);
    const formHits = context.hitLog.filter(
      (hit) => hit.actionId === 'formSkill'
    );
    expect(formHits).toHaveLength(3);
    formHits.forEach((hit) => expect(hit.element).toBe('Cryo'));
  });

  it('performs the action itself while the condition does not hold', () => {
    const { trace } = simulateFile(skillForm('none'), {
      blocks: threeSkills.slice(0, 2),
      flags: { formOn: false },
    });
    expect(trace.map((entry) => entry.performedAction)).toEqual([
      undefined,
      undefined,
    ]);
    // Arlecchino's own E cooldown: 1800 frames after a 16-frame delay.
    expect(startsOf(trace, 'skill')).toEqual([0, 1816]);
  });

  it('shares the replaced action cooldown by default', () => {
    const { trace } = simulateFile(skillForm(), {
      blocks: threeSkills.slice(0, 2),
      flags: { formOn: true },
    });
    expect(startsOf(trace, 'skill')).toEqual([0, 1816]);
  });

  it('can have a cooldown of its own', () => {
    const { trace } = simulateFile(skillForm({ frames: 120 }), {
      blocks: threeSkills,
      flags: { formOn: true },
    });
    expect(startsOf(trace, 'skill')).toEqual([0, 120, 240]);
  });

  it('gives a Normal Attack form a combo of its own', () => {
    const file = editCharacter('arlecchino', (character) => {
      const normal = findTalent(character, 'normalAttack');
      const rows = normal.rows
        .filter((row: { id: string }) =>
          ['normal-1', 'normal-2', 'normal-3'].includes(row.id)
        )
        .map((row: { id: string; timing: { action: string } }) => ({
          ...structuredClone(row),
          id: `fiery-${row.id}`,
          timing: { ...row.timing, action: 'fieryNormal' },
        }));
      normal.rows.push(...rows);
      normal.forms = [
        {
          id: 'fieryNormal',
          label: 'Fiery Normal Attack',
          shortLabel: 'F',
          while: { flag: 'formOn' },
          element: 'Electro',
        },
      ];
    });
    const { trace, context } = simulateFile(file, {
      blocks: [block('n', 'normal', { hits: 4 })],
      flags: { formOn: true },
    });
    expect(trace.map((entry) => entry.label)).toEqual(['F1', 'F2', 'F3', 'F1']);
    const hits = context.hitLog.filter((hit) => hit.actionId === 'fieryNormal');
    expect(hits).toHaveLength(4);
    hits.forEach((hit) => {
      expect(hit.element).toBe('Electro');
      expect(hit.category).toBe('Normal');
    });
  });

  it('rejects a form of an action the character does not have', () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').forms = [
        {
          id: 'broken',
          replaces: 'nothing',
          while: { flag: 'formOn' },
          end: 10,
        },
      ];
    });
    expect(() => simulateFile(file)).toThrow(/unknown action "nothing"/);
  });
});

describe('previous-action condition', () => {
  it('allows an action only right after another one', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.actionRules = [
        {
          action: 'charged',
          requires: { previous: 'normal' },
          message: 'Only right after a Normal Attack',
        },
      ];
    });
    const { trace } = simulateFile(file, {
      blocks: [
        block('ca-1', 'charged'),
        block('n', 'normal'),
        block('ca-2', 'charged'),
      ],
    });
    const rule = 'Only right after a Normal Attack';
    expect(trace.map((entry) => entry.warning === rule)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('picks a form by the previous action', () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').forms = [
        {
          id: 'afterCharged',
          while: { previous: 'charged' },
          cooldown: 'none',
          end: 30,
          hits: [{ row: 'elementalSkill/skill-spike', frame: 5 }],
        },
      ];
    });
    const performed = (first: string) =>
      simulateFile(file, {
        blocks: [block('first', first), block('e', 'skill')],
      }).trace.find((entry) => entry.blockUid === 'e')?.performedAction;
    expect(performed('charged')).toBe('afterCharged');
    expect(performed('normal')).toBeUndefined();
  });
});

describe('hit triggers by category', () => {
  it('fires on every hit of the category', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push({
        id: 'on-charged-hit',
        type: 'trigger',
        source: 'talent',
        label: 'Charged hit',
        when: { hit: 'category:Charged' },
        do: [{ count: 'chargedHits' }],
      });
    });
    const { result, context } = simulateFile(file, {
      blocks: [
        block('ca-1', 'charged'),
        block('n', 'normal'),
        block('ca-2', 'charged'),
      ],
    });
    const chargedHits = context.hitLog.filter(
      (hit) => hit.category === 'Charged'
    );
    expect(chargedHits.length).toBeGreaterThan(0);
    expect(result.activity?.triggers['on-charged-hit']).toHaveLength(
      chargedHits.length
    );
  });
});

describe('bonus cap', () => {
  const withBonus = (bonus: Record<string, unknown>) =>
    editCharacter('arlecchino', (character) => {
      character.blocks.push({
        id: 'test-flat',
        type: 'bonus',
        source: 'talent',
        label: 'Test flat DMG',
        stat: 'flatDamage',
        match: { categories: ['Normal'] },
        ...bonus,
      });
    });
  const firstNormalDamage = (file: unknown) =>
    simulateFile(file, { blocks: [block('n', 'normal')] }).context.hitLog[0]
      .damage;

  it('never gives more than its cap', () => {
    // 1000% of ATK is far more than 500 flat DMG.
    const capped = firstNormalDamage(
      withBonus({ value: 1000, ofStat: 'atk', cap: 500 })
    );
    const flat = firstNormalDamage(withBonus({ value: 500 }));
    expect(capped).toBeCloseTo(flat, 6);
  });

  it('gives the bonus itself when under the cap', () => {
    const capped = firstNormalDamage(withBonus({ value: 100, cap: 500 }));
    const uncapped = firstNormalDamage(withBonus({ value: 100 }));
    expect(capped).toBeCloseTo(uncapped, 6);
  });
});

describe('delayed status removal', () => {
  it('only ends the instance that was up when it was scheduled', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        {
          id: 'testBuff',
          type: 'status',
          source: 'talent',
          label: 'Test buff',
          durationFrames: 600,
        },
        {
          id: 'apply-test-buff',
          type: 'trigger',
          source: 'talent',
          label: 'Charged applies the buff',
          when: { use: 'charged' },
          do: [{ applyStatus: 'testBuff' }],
        },
        {
          id: 'end-test-buff',
          type: 'trigger',
          source: 'talent',
          label: 'Normal ends it 100 frames later',
          when: { use: 'normal' },
          do: [{ removeStatus: 'testBuff', delayFrames: 100 }],
        }
      );
    });
    // The second Charged Attack re-applies the buff before the removal the
    // Normal Attack scheduled, so that removal no longer applies.
    const { result, trace } = simulateFile(file, {
      blocks: [
        block('ca-1', 'charged'),
        block('n', 'normal'),
        block('ca-2', 'charged'),
      ],
    });
    const secondCharged = Math.round(
      (trace.find((entry) => entry.blockUid === 'ca-2')?.startTime ?? 0) * 60
    );
    const removalFrame =
      Math.round(
        (trace.find((entry) => entry.blockUid === 'n')?.startTime ?? 0) * 60
      ) + 100;
    expect(secondCharged).toBeLessThan(removalFrame);
    const intervals = result.activity?.statuses.testBuff ?? [];
    expect(intervals.at(-1)?.end).toBe(secondCharged + 600);
  });
});

describe('nightsoul system', () => {
  // Varesa-like: 40 points, +20 per Charged Attack, a 15 s Blessing
  // entered at full points that resets them when it ends.
  const timedBlessing = (blessing: Record<string, unknown>) =>
    editCharacter('arlecchino', (character) => {
      character.systems.nightsoul = {
        maxPoints: 40,
        blessing: { durationFrames: 900, ...blessing },
        nightsoulBurst: {},
      };
      character.blocks.push({
        id: 'charged-points',
        type: 'trigger',
        source: 'talent',
        label: 'Charged Attack: +20 Nightsoul points',
        when: { use: 'charged' },
        do: [{ addResource: 'nightsoul', amount: 20 }],
      });
    });
  const twoCharged = [block('ca-1', 'charged'), block('ca-2', 'charged')];

  it('enters the Blessing at full points and resets them when it ends', () => {
    const { result, trace } = simulateFile(
      timedBlessing({ enterAtMax: true, resetPointsOnEnd: true }),
      { blocks: twoCharged }
    );
    const full = Math.round((trace[1]?.startTime ?? 0) * 60);
    expect(result.activity?.statuses.nightsoulBlessing).toEqual([
      { start: full, end: full + 900 },
    ]);
    expect(result.activity?.resources.nightsoul.at(-1)).toEqual({
      frame: full + 900,
      value: 0,
    });
  });

  it('leaves the Blessing to the kit without enterAtMax', () => {
    const { result } = simulateFile(timedBlessing({}), { blocks: twoCharged });
    expect(result.activity?.statuses.nightsoulBlessing ?? []).toEqual([]);
    expect(result.activity?.resources.nightsoul.at(-1)?.value).toBe(40);
  });

  it('fires the Nightsoul Burst once per ICD for the party size', () => {
    const icdFor = (members: string) => {
      const { result } = simulateFile(timedBlessing({}), {
        numbers: { natlanPartyMembers: members, duration: '60' },
      });
      const fired = Object.entries(result.activity?.triggers ?? {})
        .filter(([id]) => id.startsWith('nightsoul-burst-'))
        .flatMap(([, frames]) => frames);
      expect(fired.length).toBeGreaterThan(1);
      return Math.min(
        ...fired.slice(1).map((frame, index) => frame - fired[index])
      );
    };
    expect(icdFor('1')).toBeGreaterThanOrEqual(18 * 60);
    expect(icdFor('2')).toBeGreaterThanOrEqual(12 * 60);
    expect(icdFor('3')).toBeGreaterThanOrEqual(9 * 60);
    expect(icdFor('3')).toBeLessThan(12 * 60);
  });

  it("keeps the Blessing drain's if (no points spent during Mavuika's Q)", () => {
    // A Charged Attack fills the points and enters the Blessing, with a
    // 10 s status that stops the drain.
    const file = editCharacter('arlecchino', (character) => {
      character.systems.nightsoul = {
        maxPoints: 40,
        blessing: {
          drain: {
            everyFrames: 6,
            amount: 1,
            if: { not: { status: 'noDrain' } },
          },
        },
      };
      character.blocks.push(
        {
          id: 'noDrain',
          type: 'status',
          source: 'talent',
          label: 'No drain',
          durationFrames: 600,
        },
        {
          id: 'charged-blessing',
          type: 'trigger',
          source: 'talent',
          label: 'Charged Attack: full points, Blessing, no drain',
          when: { use: 'charged' },
          do: [
            { addResource: 'nightsoul', amount: 40 },
            { applyStatus: 'nightsoulBlessing' },
            { applyStatus: 'noDrain' },
          ],
        }
      );
    });
    const { result } = simulateFile(file, {
      blocks: [block('ca', 'charged')],
    });
    const [noDrain] = result.activity?.statuses.noDrain ?? [];
    const spent = (result.activity?.resources.nightsoul ?? []).filter(
      ({ frame, value }) =>
        frame > noDrain.start && frame < noDrain.end && value < 40
    );
    expect(spent).toEqual([]);
    // Then the 40 points drain, one every 6 frames.
    const [blessing] = result.activity?.statuses.nightsoulBlessing ?? [];
    expect(blessing.end).toBeGreaterThan(noDrain.end + 39 * 6);
    expect(blessing.end).toBeLessThanOrEqual(noDrain.end + 40 * 6);
  });

  it('rejects a Blessing that both drains and has a duration', () => {
    const file = timedBlessing({ drain: { everyFrames: 6 } });
    expect(() => simulateFile(file)).toThrow(/either drains/);
  });
});

describe('cancels', () => {
  // Arlecchino's Charged Attack ends at frame 53; it cancels into the E at
  // 20 and into a Dodge at 30.
  const withCancels = (cancels: Record<string, number>) =>
    editCharacter('arlecchino', (character) => {
      const charged = findTalent(character, 'normalAttack').rows.find(
        (row: { id: string }) => row.id === 'charged'
      );
      charged.timing.cancels = cancels;
    });
  const startOf = (
    trace: { blockUid: string; startTime: number }[],
    uid: string
  ) =>
    Math.round(
      (trace.find((entry) => entry.blockUid === uid)?.startTime ?? 0) * 60
    );

  it('starts the next action at its cancel frame', () => {
    const { trace } = simulateFile(withCancels({ skill: 20 }), {
      blocks: [block('ca', 'charged'), block('e', 'skill')],
    });
    expect(startOf(trace, 'e')).toBe(20);
    // The Charged Attack's own entry ends where the E starts.
    expect(trace[0].endTime * 60).toBeCloseTo(20, 6);
  });

  it('waits for the end of the animation for any other action', () => {
    const { trace } = simulateFile(withCancels({ skill: 20 }), {
      blocks: [block('ca', 'charged'), block('n', 'normal')],
    });
    expect(startOf(trace, 'n')).toBe(53);
  });

  it('matches the next action by kind, and prefers its id', () => {
    const file = withCancels({ dodge: 30, skill: 20, normal: 40 });
    const after = (next: string) =>
      startOf(
        simulateFile(file, {
          blocks: [block('ca', 'charged'), block('next', next)],
        }).trace,
        'next'
      );
    expect(after('dodge')).toBe(30);
    expect(after('skill')).toBe(20);
    expect(after('normal')).toBe(40);
  });

  it('counts from the start of a Charged Attack whose windup was skipped', () => {
    // After a Normal Attack, Arlecchino's Charged Attack skips 12 frames.
    const { trace } = simulateFile(withCancels({ skill: 20 }), {
      blocks: [
        block('n', 'normal'),
        block('ca', 'charged'),
        block('e', 'skill'),
      ],
    });
    expect(startOf(trace, 'e') - startOf(trace, 'ca')).toBe(8);
  });

  it('applies to forms and extra actions too', () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').forms = [
        {
          id: 'formSkill',
          while: { flag: 'formOn' },
          cooldown: 'none',
          end: 60,
          cancels: { normal: 10 },
          hits: [{ row: 'elementalSkill/skill-spike', frame: 5 }],
        },
      ];
    });
    const { trace } = simulateFile(file, {
      blocks: [block('e', 'skill'), block('n', 'normal')],
      flags: { formOn: true },
    });
    expect(startOf(trace, 'n')).toBe(10);
  });
});

// ------------------------------------------------------------------
// Review findings: each test reproduces a reported engine bug.

const trigger = (
  id: string,
  when: Record<string, string>,
  ops: Record<string, unknown>[],
  extra: Record<string, unknown> = {}
) => ({
  id,
  type: 'trigger',
  source: 'talent',
  label: id,
  when,
  do: ops,
  ...extra,
});

const status = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'status',
  source: 'talent',
  label: id,
  ...extra,
});

const resource = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'resource',
  source: 'talent',
  label: id,
  min: 0,
  max: 100,
  ...extra,
});

const frameOf = (
  trace: { blockUid: string; startTime: number }[],
  uid: string
) =>
  Math.round(
    (trace.find((entry) => entry.blockUid === uid)?.startTime ?? NaN) * 60
  );

describe('planning after a cancel', () => {
  it('does not show the next action a hit that has not landed yet', () => {
    // Charged Attack: hit at 37, cancelled into the E at 20.
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'normalAttack').rows.find(
        (row: { id: string }) => row.id === 'charged'
      ).timing.cancels = { skill: 20 };
      character.blocks.push(
        resource('probe'),
        trigger('charged-hit-probe', { hit: 'charged' }, [
          { addResource: 'probe', amount: 10 },
        ]),
        trigger('skill-sees-probe', { use: 'skill' }, [{ count: 'saw' }], {
          if: { resource: 'probe', gte: 10 },
        })
      );
    });
    const { result, trace } = simulateFile(file, {
      blocks: [block('ca', 'charged'), block('e', 'skill')],
    });
    expect(frameOf(trace, 'e')).toBe(20);
    expect(result.activity?.triggers['skill-sees-probe'] ?? []).toEqual([]);
    expect(result.activity?.triggers['charged-hit-probe']).toEqual([37]);
  });
});

describe('cooldown charges and cuts', () => {
  it('moves the queued charge earlier when the recharging one is cut', () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').cooldown = {
        frames: 600,
        delayFrames: 0,
        charges: 2,
      };
      character.blocks.push(
        trigger('normal-cuts-e', { use: 'normal' }, [
          { reduceCooldown: 'skill', frames: 120 },
        ])
      );
    });
    const { trace } = simulateFile(file, {
      blocks: [
        block('e1', 'skill'),
        block('e2', 'skill'),
        block('n', 'normal'),
        block('e3', 'skill'),
        block('e4', 'skill'),
      ],
    });
    // Charge 1 is back at 600 - 120 = 480; charge 2 recharges after it,
    // so it is back 600 frames later (1080), not at the original 1200.
    expect(startsOf(trace, 'skill')).toEqual([0, 77, 480, 1080]);
  });
});

describe('energy on its way', () => {
  it('waits for particles already flying instead of skipping the Q', () => {
    const file = editCharacter('mualani', (character) => {
      character.blocks.push(
        trigger('normal-particles', { use: 'normal' }, [
          { particles: 4, afterFrames: 60 },
        ])
      );
    });
    const { trace } = simulateFile(file, {
      blocks: [block('n', 'normal'), block('q', 'burst')],
      numbers: { startingEnergy: '50', energyRecharge: '100' },
    });
    const burst = trace.find((entry) => entry.blockUid === 'q');
    expect(burst?.warning ?? '').not.toMatch(/Not enough Energy/);
    expect(frameOf(trace, 'q')).toBe(60);
  });
});

describe('default element of form hits', () => {
  it('makes Normal and Charged forms with their own hits Physical', () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'normalAttack').forms = [
        {
          id: 'plainNormal',
          while: { flag: 'formOn' },
          end: 30,
          hits: [{ row: 'normalAttack/normal-1', frame: 5 }],
        },
        {
          id: 'plainCharged',
          replaces: 'charged',
          while: { flag: 'formOn' },
          end: 30,
          hits: [{ row: 'normalAttack/charged', frame: 5 }],
        },
      ];
    });
    const { context } = simulateFile(file, {
      blocks: [block('n', 'normal'), block('ca', 'charged')],
      flags: { formOn: true },
    });
    const formHits = context.hitLog.filter((hit) =>
      ['plainNormal', 'plainCharged'].includes(hit.actionId ?? '')
    );
    expect(formHits).toHaveLength(2);
    formHits.forEach((hit) => expect(hit.element).toBe('Physical'));
  });
});

describe('statusEnds of stack statuses', () => {
  const withStacks = editCharacter('arlecchino', (character) => {
    character.blocks.push(
      status('testStacks', { stacks: { max: 3, durationFrames: 100 } }),
      trigger('charged-stacks', { use: 'charged' }, [
        { addStack: 'testStacks' },
      ]),
      trigger('skill-clears', { use: 'skill' }, [
        { removeStatus: 'testStacks' },
      ]),
      trigger('stacks-ended', { statusEnds: 'testStacks' }, [
        { count: 'ended' },
      ])
    );
  });

  it('fires when the last stack expires', () => {
    const { result } = simulateFile(withStacks, {
      blocks: [block('ca', 'charged')],
    });
    // The stack added at 0 counts on frames 1-100.
    expect(result.activity?.triggers['stacks-ended']).toEqual([101]);
  });

  it('does not fire again when stacks that already expired are removed', () => {
    const { result, trace } = simulateFile(withStacks, {
      blocks: [
        block('ca', 'charged'),
        block('w', 'wait', { seconds: 5 }),
        block('e', 'skill'),
      ],
    });
    expect(frameOf(trace, 'e')).toBeGreaterThan(101);
    expect(result.activity?.triggers['stacks-ended']).toEqual([101]);
  });
});

describe('statusEnds frame', () => {
  it('fires on the first frame without the status, drained or expired', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        resource('fuel', { max: 10, initial: 10 }),
        status('burning', {
          drain: { resource: 'fuel', amount: 5, everyFrames: 10 },
        }),
        status('timed', { durationFrames: 20 }),
        trigger('charged-starts', { use: 'charged' }, [
          { applyStatus: 'burning' },
          { applyStatus: 'timed' },
        ]),
        trigger('burning-ended', { statusEnds: 'burning' }, [{ count: 'x' }], {
          if: { not: { status: 'burning' } },
        }),
        trigger('timed-ended', { statusEnds: 'timed' }, [{ count: 'y' }], {
          if: { not: { status: 'timed' } },
        })
      );
    });
    const { result } = simulateFile(file, { blocks: [block('ca', 'charged')] });
    expect(result.activity?.statuses.burning).toEqual([{ start: 0, end: 21 }]);
    expect(result.activity?.triggers['timed-ended']).toEqual([20]);
    expect(result.activity?.triggers['burning-ended']).toEqual([21]);
  });
});

describe('what forms inherit', () => {
  const formOf = (talentEdit: Record<string, unknown>) =>
    editCharacter('arlecchino', (character) => {
      const skill = findTalent(character, 'elementalSkill');
      Object.assign(skill, talentEdit);
      skill.forms = [
        {
          id: 'formSkill',
          while: { flag: 'formOn' },
          cooldown: 'none',
          hits: [{ row: 'elementalSkill/skill-spike', frame: 5 }],
        },
      ];
    });

  it("keeps the replaced action's cancels", () => {
    const { trace } = simulateFile(formOf({ cancels: { normal: 20 } }), {
      blocks: [block('e', 'skill'), block('n', 'normal')],
      flags: { formOn: true },
    });
    expect(trace[0].performedAction).toBe('formSkill');
    expect(frameOf(trace, 'n')).toBe(20);
  });

  it('keeps castDuringPrevious', () => {
    const { trace } = simulateFile(formOf({ castDuringPrevious: true }), {
      blocks: [block('n', 'normal'), block('e', 'skill')],
      flags: { formOn: true },
    });
    expect(trace[1].performedAction).toBe('formSkill');
    // Cast at the Normal Attack's first hit (frame 11).
    expect(frameOf(trace, 'e')).toBe(11);
  });

  it("uses an action rule's cooldown when it shares the cooldown", () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').forms = [
        {
          id: 'formSkill',
          while: { flag: 'formOn' },
          end: 30,
          hits: [{ row: 'elementalSkill/skill-spike', frame: 5 }],
        },
      ];
      character.actionRules = [
        { action: 'skill', cooldown: { frames: 300, delayFrames: 0 } },
      ];
    });
    const starts = (formOn: boolean) =>
      startsOf(
        simulateFile(file, {
          blocks: [block('e1', 'skill'), block('e2', 'skill')],
          flags: { formOn },
        }).trace,
        'skill'
      );
    expect(starts(false)).toEqual([0, 300]);
    expect(starts(true)).toEqual([0, 300]);
  });
});

describe('startCooldown op', () => {
  it('starts a cooldown by its cooldown id, as reduceCooldown takes', () => {
    const file = editCharacter('arlecchino', (character) => {
      findTalent(character, 'elementalSkill').forms = [
        {
          id: 'formSkill',
          while: { flag: 'formOn' },
          end: 30,
          cooldownId: 'formCd',
          cooldown: { frames: 200, deferred: true },
          hits: [{ row: 'elementalSkill/skill-spike', frame: 5 }],
        },
      ];
      character.blocks.push(
        trigger('charged-starts-cd', { use: 'charged' }, [
          { startCooldown: 'formCd' },
        ])
      );
    });
    const { trace } = simulateFile(file, {
      blocks: [
        block('e1', 'skill'),
        block('ca', 'charged'),
        block('e2', 'skill'),
      ],
      flags: { formOn: true },
    });
    expect(frameOf(trace, 'e2')).toBe(frameOf(trace, 'ca') + 200);
  });
});

describe('scheduled statuses', () => {
  it('removes later a status that was only scheduled when the removal was', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        status('later', { durationFrames: 1000 }),
        trigger('charged-later', { use: 'charged' }, [
          { applyStatus: 'later', afterFrames: 60 },
          { removeStatus: 'later', delayFrames: 300 },
        ])
      );
    });
    const { result } = simulateFile(file, { blocks: [block('ca', 'charged')] });
    expect(result.activity?.statuses.later).toEqual([{ start: 60, end: 300 }]);
  });

  it('does not count a child its parent will not live to receive', () => {
    const withParent = (parentFrames: number) =>
      editCharacter('arlecchino', (character) => {
        character.blocks.push(
          status('parent', { durationFrames: parentFrames }),
          status('child', { endsWith: 'parent' }),
          trigger('start-parent', { use: 'probe' }, [
            { applyStatus: 'parent' },
            { applyStatus: 'child', afterFrames: 200 },
          ])
        );
      });
    const childAtEvent = (parentFrames: number) => {
      const { runtime } = createFileRuntime(withParent(parentFrames));
      runtime.fireTriggers('use', ['probe'], 0, null);
      return runtime.evaluate({ status: 'child', atEvent: 'later' }, 50, {
        eventFrames: { later: 250 },
      });
    };
    expect(childAtEvent(1000)).toBe(true);
    // The parent is gone at 100, so the child is never applied.
    expect(childAtEvent(100)).toBe(false);
  });
});

describe('automatic entry conditions', () => {
  it('lets a later entry start at its cancel when an earlier one is turned down', () => {
    // N1 ends at 17 but cancels into the E at 5. The first entry (a Charged
    // Attack, only possible at 17) is turned down; the E still starts at 5.
    const file = editCharacter('arlecchino', (character) => {
      const normal = findTalent(character, 'normalAttack');
      normal.rows[0].timing.cancels = { skill: 5 };
      character.automatic = [
        { use: 'charged', if: { status: 'never' } },
        { use: 'skill', if: { previous: 'normal' } },
        { use: 'normal' },
      ];
      character.blocks.push(status('never', { durationFrames: 10 }));
    });
    const { trace } = simulateFile(file, { numbers: { duration: '2' } });
    expect(trace[0].action).toBe('normal');
    expect(startsOf(trace, 'skill')[0]).toBe(5);
  });

  it('does not let an action with forms hold back a cancel', () => {
    // Same, but the turned-down entry has a form: picking its form must not
    // run the events up to that entry's start.
    const file = editCharacter('arlecchino', (character) => {
      const normal = findTalent(character, 'normalAttack');
      normal.rows[0].timing.cancels = { skill: 5 };
      normal.forms = [
        {
          id: 'neverCharged',
          replaces: 'charged',
          while: { status: 'never' },
          end: 30,
          hits: [{ row: 'normalAttack/charged', frame: 10 }],
        },
      ];
      character.automatic = [
        { use: 'charged', if: { status: 'never' } },
        { use: 'skill', if: { previous: 'normal' } },
        { use: 'normal' },
      ];
      character.blocks.push(status('never', { durationFrames: 10 }));
    });
    const { trace } = simulateFile(file, { numbers: { duration: '2' } });
    expect(startsOf(trace, 'skill')[0]).toBe(5);
  });

  // Fails today: the entry's `if` is checked before waiting for the
  // cooldown. Fixing it needs the planner to look ahead without running
  // events (see the review notes), so it is kept as a known failure.
  it.fails(
    're-checks the entry condition after waiting for the cooldown',
    () => {
      const file = editCharacter('arlecchino', (character) => {
        character.automatic = [
          { use: 'skill', if: { status: 'window' } },
          { use: 'normal' },
        ];
        character.blocks.push(
          status('window', { durationFrames: 300 }),
          trigger(
            'normal-opens-window',
            { use: 'normal' },
            [{ applyStatus: 'window' }],
            { icdFrames: 100000 }
          )
        );
      });
      const { result, trace } = simulateFile(file, {
        numbers: { duration: '40' },
      });
      const skills = trace.filter((entry) => entry.action === 'skill');
      expect(skills.length).toBeGreaterThan(1);
      // Every E is cast inside the window.
      const window = result.activity?.statuses.window ?? [];
      skills.forEach((entry) => {
        const frame = Math.round(entry.startTime * 60);
        expect(
          window.some((span) => frame >= span.start && frame < span.end)
        ).toBe(true);
      });
    }
  );
});

describe('stack timeline', () => {
  it('logs each stack over the frames it counts', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        status('pip', { stacks: { max: 1, durationFrames: 10 } }),
        trigger('probe-pip', { use: 'probe' }, [{ addStack: 'pip' }])
      );
    });
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probe'], 0, null);
    const [logged] = runtime.finishActivity(1000).stacks.pip;
    for (let frame = 0; frame <= 20; frame++) {
      expect(runtime.isActive('pip', frame), `frame ${frame}`).toBe(
        frame >= logged.start && frame < logged.end
      );
    }
  });
});

describe('resource budget', () => {
  it('only spends the budget on what was actually gained', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        trigger('probe-bond', { use: 'probe' }, [
          { applyStatus: 'debtWindow' },
          {
            addResource: 'bondOfLife',
            amount: 65,
            budget: { resource: 'directiveDebt', whileStatus: 'debtWindow' },
          },
        ])
      );
    });
    // Bond of Life is already at its 200% cap.
    const { runtime } = createFileRuntime(file, { numbers: { bond: '200' } });
    runtime.fireTriggers('use', ['probe'], 0, null);
    expect(runtime.getResource('bondOfLife')).toBe(200);
    expect(runtime.getResource('directiveDebt')).toBe(0);
  });
});

describe('Nightsoul Burst', () => {
  it('needs Elemental DMG: Physical hits do not fire it', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.systems.nightsoul = {
        maxPoints: 40,
        blessing: { durationFrames: 900 },
        nightsoulBurst: {},
      };
    });
    const { result, context } = simulateFile(file, {
      blocks: [block('n', 'normal', { hits: 6 })],
      numbers: { natlanPartyMembers: '3' },
    });
    expect(context.hitLog.every((hit) => hit.element === 'Physical')).toBe(
      true
    );
    const fired = Object.entries(result.activity?.triggers ?? {}).filter(
      ([id]) => id.startsWith('nightsoul-burst-')
    );
    expect(fired).toEqual([]);
  });
});

describe('addMultiplier rows', () => {
  it('scales by the stat of the row, not always the scaling stat', () => {
    const withBonus = (bonus: Record<string, unknown>) =>
      editCharacter('arlecchino', (character) => {
        findTalent(character, 'normalAttack').rows.push({
          type: 'multiplier',
          id: 'test-def',
          label: 'Test DEF row',
          components: [{ stat: 'def', values: Array(13).fill(100) }],
        });
        character.blocks.push({
          id: 'test-extra',
          type: 'bonus',
          source: 'talent',
          label: 'Test extra',
          match: { actions: ['normal'] },
          ...bonus,
        });
      });
    const firstNormal = (file: unknown) =>
      simulateFile(file, {
        blocks: [block('n', 'normal')],
        numbers: { bond: '100' },
      }).context.hitLog[0].damage;
    // 100% DEF × 100 Bond of Life / 100 is flat DMG equal to DEF.
    const extra = firstNormal(
      withBonus({
        addMultiplier: {
          row: 'normalAttack/test-def',
          perResource: 'bondOfLife',
          per: 100,
        },
      })
    );
    const flat = firstNormal(
      withBonus({ stat: 'flatDamage', value: 100, ofStat: 'def' })
    );
    expect(extra).toBeCloseTo(flat, 6);
  });
});

describe('load-time validation', () => {
  // At load, before anything is simulated.
  // Edits write invalid values on purpose, so the file is loosely typed here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rejects = (edit: (character: any) => void) =>
    expect(() =>
      loadCharacterFile(editCharacter('arlecchino', edit))
    ).toThrow();

  it('rejects an E with hits and no end', () =>
    rejects((character) => {
      delete findTalent(character, 'elementalSkill').end;
    }));

  it('rejects a stack status with other timing fields', () =>
    rejects((character) =>
      character.blocks.push(
        status('both', {
          stacks: { max: 2, durationFrames: 60 },
          durationFrames: 300,
        })
      )
    ));

  it('rejects a count by an unknown value', () =>
    rejects((character) =>
      character.blocks.push(
        trigger('bad-count', { use: 'normal' }, [
          { count: 'x', by: 'nonsense' },
        ])
      )
    ));

  it('rejects a condition on a resource that does not exist', () =>
    rejects((character) =>
      character.blocks.push(
        trigger('bad-resource', { use: 'normal' }, [{ count: 'x' }], {
          if: { resource: 'nope', gte: 1 },
        })
      )
    ));

  it('rejects an op on a status that does not exist', () =>
    rejects((character) =>
      character.blocks.push(
        trigger('bad-status', { use: 'normal' }, [{ applyStatus: 'nope' }])
      )
    ));
});

describe('resourceChanges direction', () => {
  it('fires only on the direction asked for', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        resource('meter'),
        trigger('probe-up', { use: 'probeUp' }, [
          { addResource: 'meter', amount: 10 },
        ]),
        trigger('probe-down', { use: 'probeDown' }, [
          { addResource: 'meter', amount: -1 },
        ]),
        {
          ...trigger('meter-spent', { resourceChanges: 'meter' }, [
            { count: 'spent' },
          ]),
          when: { resourceChanges: 'meter', change: 'decrease' },
        },
        {
          ...trigger('meter-gained', { resourceChanges: 'meter' }, [
            { count: 'gained' },
          ]),
          when: { resourceChanges: 'meter', change: 'increase' },
        }
      );
    });
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probeUp'], 0, null);
    runtime.fireTriggers('use', ['probeDown'], 5, null);
    const { triggers } = runtime.finishActivity(100);
    expect(triggers['meter-gained']).toEqual([0]);
    expect(triggers['meter-spent']).toEqual([5]);
  });
});

describe('rotation palette', () => {
  it('shows only the listed actions, in that order', () => {
    const file = editCharacter('mualani', (character) => {
      character.rotation.palette = ['sharkBite', 'skill', 'burst'];
    });
    const { rotation } = loadCharacterFile(file);
    const visible = rotation?.actions.filter((action) => !action.hidden) ?? [];
    expect(visible.map((action) => action.id)).toEqual([
      'sharkBite',
      'skill',
      'burst',
    ]);
    // The others still exist (an automatic copy may use them).
    expect(rotation?.actions.some((action) => action.id === 'normal')).toBe(
      true
    );
  });

  it('rejects an id that is not an action', () => {
    const file = editCharacter('mualani', (character) => {
      character.rotation.palette = ['skill', 'typo'];
    });
    expect(() => loadCharacterFile(file)).toThrow(/typo/);
  });
});

describe('Energy from Normal and Charged Attack hits', () => {
  // Mualani with no Energy, so only these hits can give any.
  const energyAfter = (
    blocks: ReturnType<typeof block>[],
    edit: (character: Record<string, unknown>) => void = () => {}
  ) => {
    const file = editCharacter('mualani', edit);
    const { result } = simulateFile(file, {
      blocks,
      numbers: { startingEnergy: '0', duration: '10' },
      flags: { useBurst: false },
    });
    const energy = result.activity?.resources.energy ?? [];
    return energy[energy.length - 1]?.value ?? 0;
  };

  it('gives the expected Energy of a catalyst (0%, +10% per miss)', () => {
    // Three hits: 0 + 0.1 + (0.9 × 0.2) = 0.28.
    expect(energyAfter([block('n', 'normal', { hits: 3 })])).toBeCloseTo(
      0.28,
      6
    );
  });

  it('starts a sword at 10% (+5% per miss)', () => {
    // 0.1 + 0.145 + 0.181 = 0.426.
    expect(
      energyAfter([block('n', 'normal', { hits: 3 })], (character) => {
        character.weaponType = 'Sword';
      })
    ).toBeCloseTo(0.426, 6);
  });

  it('logs the Energy gained this way as its own resource', () => {
    const file = editCharacter('mualani', () => {});
    const { result } = simulateFile(file, {
      blocks: [block('n', 'normal', { hits: 3 })],
      numbers: { startingEnergy: '0', duration: '10' },
      flags: { useBurst: false },
    });
    const gained = result.activity?.resources.hitEnergy ?? [];
    expect(gained[gained.length - 1]?.value).toBeCloseTo(0.28, 6);
  });

  it('gives none for other hits', () => {
    // The Q's hit does not count; its cost empties the bar.
    const file = editCharacter('mualani', () => {});
    const { result } = simulateFile(file, {
      blocks: [block('q', 'burst')],
      numbers: { startingEnergy: '60', duration: '5' },
    });
    const energy = result.activity?.resources.energy ?? [];
    expect(energy[energy.length - 1]?.value).toBe(0);
  });
});

describe('enemy particles', () => {
  const run = (numbers: Record<string, string>) => {
    const file = editCharacter('mualani', () => {});
    const { result, context } = simulateFile(file, {
      blocks: [block('n', 'normal', { hits: 3 })],
      numbers: { startingEnergy: '0', duration: '10', ...numbers },
      flags: { useBurst: false },
    });
    const energy = result.activity?.resources.energy ?? [];
    return {
      energy: energy[energy.length - 1]?.value ?? 0,
      damage: context.totalDamage,
    };
  };
  // What the 3 hits deal, and the Energy they restore themselves.
  const { damage, energy: fromHits } = run({});
  const clear = 2 * 1.097;

  it('drops nothing with no HP set', () => {
    expect(fromHits).toBeCloseTo(0.28, 6);
  });

  it('drops a clear particle each time it loses the set share of its HP', () => {
    // A drop every third of an HP a bit under the damage dealt: 3 drops.
    expect(
      run({ enemyHp: String(damage / 1.01), enemyParticleEvery: '33.4' }).energy
    ).toBeCloseTo(fromHits + 3 * clear, 6);
  });

  it('drops the set number of particles each time', () => {
    expect(
      run({
        enemyHp: String(damage / 1.01),
        enemyParticleEvery: '100',
        enemyParticles: '2',
      }).energy
    ).toBeCloseTo(fromHits + 2 * clear, 6);
  });
});

describe('Overloaded (transformative reaction)', () => {
  // Every Normal Attack hit of Mualani triggers Overloaded, at most once
  // every 2 s (the ICD a kit gives it).
  const withOverloaded = (extraBlocks: unknown[] = []) =>
    editCharacter('mualani', (character) => {
      character.blocks.push(
        {
          id: 'test-overload',
          type: 'trigger',
          source: 'talent',
          label: 'Overloaded',
          when: { hit: 'normal' },
          icdFrames: 120,
          do: [{ reactionHit: 'Overloaded' }],
        },
        ...extraBlocks
      );
    });
  const run = (file: unknown, numbers: Record<string, string> = {}) =>
    simulateFile(file, {
      blocks: [block('n', 'normal', { hits: 3 })],
      numbers: { em: '100', reactionBonus: '0', ...numbers },
      flags: { useBurst: false },
    });
  const overloadedHits = (context: ReturnType<typeof run>['context']) =>
    context.hitLog.filter((hit) => hit.category === 'Overloaded');
  // Level 90 base × 2.75, EM bonus 16·EM/(EM+2000), Pyro RES 10%.
  const expected = (em: number, resMultiplier = 0.9) =>
    1446.85 * 2.75 * (1 + (16 * em) / (em + 2000)) * resMultiplier;

  it('deals Pyro damage from level, EM and RES only, never a CRIT', () => {
    const hits = overloadedHits(run(withOverloaded()).context);
    expect(hits).toHaveLength(1);
    expect(hits[0].element).toBe('Pyro');
    expect(hits[0].isCrit).toBe(false);
    expect(hits[0].critRate).toBe(0);
    expect(hits[0].reaction).toBe('Overloaded');
    expect(hits[0].damage).toBeCloseTo(expected(100), 6);
  });

  it('takes RES shred and EM bonuses that match it', () => {
    const file = withOverloaded([
      {
        id: 'test-shred',
        type: 'bonus',
        source: 'talent',
        label: 'Shred',
        stat: 'resShred',
        value: 40,
        match: { elements: ['Pyro'] },
      },
      {
        id: 'test-em',
        type: 'bonus',
        source: 'talent',
        label: 'EM',
        stat: 'elementalMastery',
        value: 100,
        match: { categories: ['Overloaded'] },
      },
    ]);
    const [hit] = overloadedHits(run(file).context);
    // 10% - 40% = -30% RES: × 1.15.
    expect(hit.damage).toBeCloseTo(expected(200, 1.15), 6);
  });

  it('fires reaction:Overloaded hit triggers', () => {
    const file = withOverloaded([
      {
        id: 'test-on-overload',
        type: 'trigger',
        source: 'talent',
        label: 'On Overloaded',
        when: { hit: 'reaction:Overloaded' },
        do: [{ count: 'overloads' }],
      },
    ]);
    const { result } = run(file);
    expect(result.activity?.triggers['test-on-overload']).toHaveLength(1);
  });

  it('rejects an unknown reaction at load', () =>
    expect(() =>
      loadCharacterFile(
        editCharacter('mualani', (character) => {
          character.blocks.push({
            id: 'bad',
            type: 'trigger',
            source: 'talent',
            label: 'Bad',
            when: { hit: 'normal' },
            do: [{ reactionHit: 'Swirl' }],
          });
        })
      )
    ).toThrow());
});

describe('CRIT hit triggers', () => {
  // A trigger on Normal Attack CRITs, and one on every Normal Attack hit.
  const file = editCharacter('mualani', (character) => {
    character.blocks.push(
      {
        id: 'test-on-crit',
        type: 'trigger',
        source: 'weapon',
        label: 'On CRIT',
        when: { hit: 'crit:normal' },
        do: [{ count: 'crits' }, { particles: 3 }],
      },
      {
        id: 'test-on-hit',
        type: 'trigger',
        source: 'weapon',
        label: 'On hit',
        when: { hit: 'normal' },
        do: [{ count: 'hits' }, { particles: 3 }],
      }
    );
  });
  const hitOnce = (crit: boolean) => {
    const edited = editCharacter('mualani', (character) => {
      character.blocks.push({
        id: 'test-trigger',
        type: 'trigger',
        source: 'weapon',
        label: 'Probe',
        when: { hit: crit ? 'crit:normal' : 'normal' },
        do: [{ particles: 3 }],
      });
    });
    const { runtime, context } = createFileRuntime(edited, {
      numbers: { startingEnergy: '0' },
    });
    runtime.performHit({
      frame: 0,
      category: 'Normal',
      element: 'Hydro',
      scaling: [{ stat: 'hp', value: 10 }],
      actionId: 'normal',
      entry: null,
    });
    runtime.queue.runUntil(600, Number.POSITIVE_INFINITY);
    return { energy: runtime.getResource('energy'), context };
  };

  it('scales counts by the CRIT Rate in expected-damage runs', () => {
    const { runtime, context } = createFileRuntime(file);
    runtime.performHit({
      frame: 0,
      category: 'Normal',
      element: 'Hydro',
      scaling: [{ stat: 'hp', value: 10 }],
      actionId: 'normal',
      entry: null,
    });
    const { critRate } = context.hitLog[0];
    expect(critRate).toBeGreaterThan(0);
    expect(runtime.getCounter('count:crits')).toBeCloseTo(critRate, 6);
    expect(runtime.getCounter('count:hits')).toBe(1);
  });

  it('scales particles by the CRIT Rate in expected-damage runs', () => {
    const onHit = hitOnce(false);
    const onCrit = hitOnce(true);
    const { critRate } = onCrit.context.hitLog[0];
    expect(onHit.energy).toBeGreaterThan(0);
    expect(onCrit.energy).toBeCloseTo(onHit.energy * critRate, 6);
  });

  it('does not fire when the hit cannot CRIT', () => {
    const { runtime } = createFileRuntime(file, { numbers: { cr: '-1000' } });
    runtime.performHit({
      frame: 0,
      category: 'Normal',
      element: 'Hydro',
      scaling: [{ stat: 'hp', value: 10 }],
      actionId: 'normal',
      entry: null,
    });
    expect(runtime.getCounter('count:crits')).toBe(0);
  });
});

describe('team buffs', () => {
  const withBuff = (extra: Record<string, unknown> = {}) =>
    editCharacter('arlecchino', (character) => {
      character.blocks.push(
        {
          id: 'test-buff',
          type: 'bonus',
          source: 'talent',
          label: 'Team ATK',
          stat: 'flatAtk',
          value: 27,
          ofStat: 'atk',
          cap: 500,
          teamBuff: true,
          ...extra,
        },
        {
          id: 'test-buff-status',
          type: 'status',
          source: 'talent',
          label: 'Buff up',
          durationFrames: 600,
        },
        {
          id: 'test-apply-buff',
          type: 'trigger',
          source: 'talent',
          label: 'Apply buff',
          when: { use: 'skill' },
          do: [{ applyStatus: 'test-buff-status' }],
        }
      );
      character.details.push(
        { label: 'Buff', value: '{buffValue:test-buff|number}' },
        { label: 'Uptime', value: '{uptime:test-buff-status|seconds}' },
        { label: 'Uptime %', value: '{uptime:test-buff-status|percent}' }
      );
    });
  const run = (file: unknown) =>
    simulateFile(file, {
      blocks: [block('e', 'skill'), block('n', 'normal')],
    });
  const detail = (result: ReturnType<typeof run>['result'], label: string) =>
    result.details.find((entry) => entry.label === label)?.value;

  it('never applies to the character’s own hits', () => {
    const plain = run(editCharacter('arlecchino', () => {}));
    const buffed = run(withBuff());
    expect(buffed.context.totalDamage).toBeCloseTo(
      plain.context.totalDamage,
      6
    );
  });

  it('reports its value, capped', () => {
    expect(detail(run(withBuff()).result, 'Buff')).toBe('500');
    // Uncapped: 27% of the screen ATK.
    const atk = run(withBuff()).loaded.character.defaults.numbers.atk;
    expect(detail(run(withBuff({ cap: 1e9 })).result, 'Buff')).toBe(
      formatNumber(atk * 0.27)
    );
  });

  it('reports 0 while its flag is off', () => {
    const { result } = simulateFile(withBuff({ ifFlag: 'buffOn' }), {
      blocks: [block('e', 'skill')],
      flags: { buffOn: false },
    });
    expect(detail(result, 'Buff')).toBe('0');
  });

  it('reports how long a status was up, in seconds and as a share', () => {
    const { result } = run(withBuff());
    expect(detail(result, 'Uptime')).toBe('10');
    expect(detail(result, 'Uptime %')).toBe('16.7%');
  });

  it('takes its value and cap from talent rows, at the talent level', () => {
    const { result, loaded } = run(
      withBuff({
        value: undefined,
        ofStat: undefined,
        cap: undefined,
        valueRow: 'elementalBurst/burst',
        capRow: 'normalAttack/normal-1',
      })
    );
    const values = parseValues(buildDefaultValues('arlecchino'));
    const cap = getRowMultiplier(
      loaded.character,
      'normalAttack/normal-1',
      values
    );
    expect(cap).toBeLessThan(
      getRowMultiplier(loaded.character, 'elementalBurst/burst', values)
    );
    expect(detail(result, 'Buff')).toBe(formatNumber(cap));
  });

  it('may take a % stat as a share of another stat', () =>
    expect(() =>
      loadCharacterFile(
        withBuff({ stat: 'atkPercent', value: 0.1, ofStat: 'hp', cap: 40 })
      )
    ).not.toThrow());
});

describe('amount from a field', () => {
  it('adds the number a form field holds', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push({
        id: 'test-add',
        type: 'trigger',
        source: 'talent',
        label: 'Add',
        when: { use: 'probe' },
        do: [{ addResource: 'bondOfLife', amount: { field: 'bond' } }],
      });
    });
    const { runtime } = createFileRuntime(file, { numbers: { bond: '30' } });
    const before = runtime.getResource('bondOfLife');
    runtime.fireTriggers('use', ['probe'], 0, null);
    expect(runtime.getResource('bondOfLife')).toBe(before + 30);
  });
});

describe('uptime of a stack status', () => {
  it('counts the frames at least one stack was up', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        {
          id: 'test-stacks',
          type: 'status',
          source: 'talent',
          label: 'Stacks',
          stacks: { max: 3, durationFrames: 120 },
        },
        {
          id: 'test-add-stack',
          type: 'trigger',
          source: 'talent',
          label: 'Add stack',
          when: { use: 'probe' },
          do: [{ addStack: 'test-stacks' }],
        }
      );
    });
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probe'], 0, null);
    runtime.fireTriggers('use', ['probe'], 60, null);
    runtime.fireTriggers('use', ['probe'], 600, null);
    // [1, 181) overlapping, then [601, 721).
    expect(runtime.getUptime('test-stacks', 3600)).toBe(180 + 120);
  });
});

describe('values from form fields', () => {
  const withBlocks = (blocks: unknown[]) =>
    editCharacter('arlecchino', (character) => {
      character.blocks.push(...blocks);
    });
  const firstNormal = (file: unknown, numbers: Record<string, string> = {}) =>
    simulateFile(file, { blocks: [block('n', 'normal')], numbers }).context
      .hitLog[0];

  it('takes a bonus value from a field', () => {
    const byField = withBlocks([
      {
        id: 'test-dmg',
        type: 'bonus',
        source: 'talent',
        label: 'DMG',
        stat: 'dmgBonus',
        valueField: 'testValue',
      },
    ]);
    const fixed = withBlocks([
      {
        id: 'test-dmg',
        type: 'bonus',
        source: 'talent',
        label: 'DMG',
        stat: 'dmgBonus',
        value: 25,
      },
    ]);
    expect(firstNormal(byField, { testValue: '25' }).damage).toBeCloseTo(
      firstNormal(fixed).damage,
      6
    );
  });

  it('takes a hit multiplier from a field', () => {
    const file = withBlocks([
      {
        id: 'test-extra',
        type: 'trigger',
        source: 'talent',
        label: 'Extra hit',
        when: { hit: 'normal' },
        do: [
          {
            hit: {
              multiplierField: 'testValue',
              element: 'Pyro',
              category: 'Extra',
            },
          },
        ],
      },
    ]);
    const extra = (testValue: string) =>
      simulateFile(file, {
        blocks: [block('n', 'normal')],
        numbers: { testValue },
      }).context.hitLog.find((hit) => hit.category === 'Extra');
    expect(extra('100')?.multiplier).toBe(100);
    expect(extra('50')?.damage).toBeCloseTo((extra('100')?.damage ?? 0) / 2, 6);
  });

  it('may take any stat as a share of another one', () => {
    const file = withBlocks([
      {
        id: 'test-crit',
        type: 'bonus',
        source: 'talent',
        label: 'CRIT from HP',
        stat: 'dmgBonus',
        value: 0.1,
        ofStat: 'hp',
      },
    ]);
    // 0.1% of 35,000 HP: +35% DMG.
    const fixed = withBlocks([
      {
        id: 'test-crit',
        type: 'bonus',
        source: 'talent',
        label: 'Fixed',
        stat: 'dmgBonus',
        value: 35,
      },
    ]);
    expect(firstNormal(file, { hp: '35000' }).damage).toBeCloseTo(
      firstNormal(fixed, { hp: '35000' }).damage,
      6
    );
  });
});

describe('a tied status applied without its parent', () => {
  // "child" ends with "parent"; a probe applies the child at any frame.
  const file = editCharacter('arlecchino', (character) => {
    character.blocks.push(
      status('parent', { durationFrames: 100 }),
      status('child', { durationFrames: 600, endsWith: 'parent' }),
      trigger('start-parent', { use: 'probeParent' }, [
        { applyStatus: 'parent' },
      ]),
      trigger('start-child', { use: 'probeChild' }, [{ applyStatus: 'child' }]),
      trigger('child-ends', { statusEnds: 'child' }, [{ count: 'childEnds' }])
    );
  });

  it('is not applied once the parent has expired', () => {
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probeParent'], 0, null);
    runtime.fireTriggers('use', ['probeChild'], 150, null);
    runtime.queue.runUntil(3600, 3600);
    expect(runtime.isActive('child', 151)).toBe(false);
    const activity = runtime.finishActivity(3600);
    expect(activity.statuses.child ?? []).toEqual([]);
    expect(runtime.getCounter('count:childEnds')).toBe(0);
  });

  it('is not applied when the parent never was', () => {
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probeChild'], 10, null);
    expect(runtime.finishActivity(3600).statuses.child ?? []).toEqual([]);
  });

  it('is applied while the parent is up, and ends with it', () => {
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probeParent'], 0, null);
    runtime.fireTriggers('use', ['probeChild'], 50, null);
    runtime.queue.runUntil(3600, 3600);
    expect(runtime.finishActivity(3600).statuses.child).toEqual([
      { start: 50, end: 100 },
    ]);
  });
});

describe('CRIT triggers with a cooldown', () => {
  // Like Favonius: on a CRIT, once every 6 s.
  const file = editCharacter('mualani', (character) => {
    character.blocks.push({
      id: 'test-on-crit-icd',
      type: 'trigger',
      source: 'weapon',
      label: 'On CRIT (6 s)',
      when: { hit: 'crit:normal' },
      icdFrames: 360,
      do: [{ count: 'procs' }],
    });
  });
  const hit = (
    runtime: ReturnType<typeof createFileRuntime>['runtime'],
    frame: number
  ) =>
    runtime.performHit({
      frame,
      category: 'Normal',
      element: 'Hydro',
      scaling: [{ stat: 'hp', value: 10 }],
      actionId: 'normal',
      entry: null,
    });

  it('adds up the chance of the hits until one could have proc’d', () => {
    const { runtime, context } = createFileRuntime(file);
    [0, 10, 20].forEach((frame) => hit(runtime, frame));
    const { critRate } = context.hitLog[0];
    // At least one CRIT among 3 hits within the cooldown.
    expect(runtime.getCounter('count:procs')).toBeCloseTo(
      1 - (1 - critRate) ** 3,
      6
    );
  });

  it('starts over once the cooldown is past', () => {
    const { runtime, context } = createFileRuntime(file);
    [0, 10, 400].forEach((frame) => hit(runtime, frame));
    const { critRate } = context.hitLog[0];
    expect(runtime.getCounter('count:procs')).toBeCloseTo(
      1 - (1 - critRate) ** 2 + critRate,
      6
    );
  });
});

describe('a skipped step in the trace', () => {
  it('is marked skipped, with its reason, and takes no time', () => {
    const { trace } = simulateFile(
      editCharacter('mualani', () => undefined),
      {
        blocks: [
          block('q1', 'burst'),
          block('q2', 'burst'),
          block('e', 'skill'),
        ],
      }
    );
    const [first, second] = trace.filter((entry) => entry.action === 'burst');
    const skill = trace.find((entry) => entry.blockUid === 'e')!;

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.warning).toBeTruthy();
    expect(skill.startTime).toBeCloseTo(second.startTime, 5);
  });
});

describe('a bonus with an `if` condition', () => {
  // Arlecchino's copy: +100% DMG while she is off the field. Her
  // Directive ticks 5 s after her E, when Nicole is on the field.
  const offField = loadCharacterFile(
    editCharacter('arlecchino', (file) => {
      file.id = 'offfielddummy';
      (file.blocks as unknown[]).push({
        id: 'off-field-dmg',
        type: 'bonus',
        source: 'talent',
        label: 'Off the field: +100% DMG',
        stat: 'dmgBonus',
        value: 100,
        if: { not: { onField: true } },
      });
    })
  );
  const team = simulateTeam(
    [
      {
        characterId: 'offfielddummy',
        values: parseValues(buildDefaultValues('arlecchino')),
        loaded: offField,
      },
      {
        characterId: 'nicole',
        values: parseValues(buildDefaultValues('nicole')),
      },
    ],
    {
      loop: false,
      blocks: [
        block('e', 'offfielddummy:skill'),
        block('n', 'nicole:skill'),
        block('w', 'nicole:wait', { seconds: 6 }),
      ],
    },
    { auras: false }
  );
  const hits = team.members.find(
    (member) => member.characterId === 'offfielddummy'
  )!.context.hitLog;

  it('applies while it holds (a Directive tick off the field)', () => {
    const tick = hits.find((hit) => hit.category === 'Directive')!;
    expect(tick.extraBonus).toBeGreaterThanOrEqual(100);
  });

  it('does not apply while it does not (her E, on the field)', () => {
    const e = hits.find((hit) => hit.category === 'Skill')!;
    expect(e.extraBonus).toBeLessThan(100);
  });
});

describe('status ticks with a fractional interval and their own first tick', () => {
  // A Mek-like status: first tick 148 frames after it starts, then every
  // 58.5 frames, rounded up per tick as gcsim does (ceil(58.5 × i)).
  const ticking = loadCharacterFile(
    editCharacter('arlecchino', (file) => {
      file.id = 'tickdummy';
      const directive = (file.blocks as { id: string; ticks?: object }[]).find(
        (entry) => entry.id === 'directive'
      )!;
      directive.ticks = {
        firstAfterFrames: 148,
        everyFrames: 58.5,
        count: 3,
        row: 'elementalSkill/blood-debt-directive',
        element: 'Pyro',
        category: 'Directive',
        gauge: 1,
        icd: 'directive',
        icdGroup: 'escoffierSkill',
      };
    })
  );
  const team = simulateTeam(
    [
      {
        characterId: 'tickdummy',
        values: parseValues(buildDefaultValues('arlecchino')),
        loaded: ticking,
      },
    ],
    {
      loop: false,
      blocks: [
        block('e', 'tickdummy:skill'),
        block('w', 'tickdummy:wait', { seconds: 10 }),
      ],
    },
    {}
  );
  const ticks = team.members[0].context.hitLog.filter(
    (hit) => hit.category === 'Directive'
  );
  const placed = team.members[0].context.hitLog.find(
    (hit) => hit.category === 'Skill'
  )!;

  it('lands at the first tick, then every 58.5 frames rounded up', () => {
    const offsets = ticks.map((hit) =>
      Math.round((hit.time - ticks[0].time) * 60)
    );
    expect(offsets).toEqual([0, 59, 117]);
    expect(ticks).toHaveLength(3);
    expect(placed).toBeDefined();
  });
});

describe('party element count', () => {
  // Arlecchino's copy: DMG Bonus by how many Pyro members the party has
  // (Escoffier's A4 tiers), and +100% only with a Pyro-only party.
  const counting = loadCharacterFile(
    editCharacter('arlecchino', (file) => {
      file.id = 'pyrocountdummy';
      (file.blocks as unknown[]).push(
        {
          id: 'per-pyro',
          type: 'bonus',
          source: 'talent',
          label: 'By Pyro members',
          stat: 'dmgBonus',
          value: [1000, 2000, 3000, 4000],
          scaleBy: { partyElements: ['Pyro'] },
        },
        {
          id: 'all-pyro',
          type: 'bonus',
          source: 'talent',
          label: 'Pyro-only party',
          stat: 'dmgBonus',
          value: 100000,
          if: { partyElements: ['Pyro'], everyone: true },
        }
      );
    })
  );
  const member = (id: string) => ({
    characterId: id,
    values: parseValues(buildDefaultValues(id)),
  });
  const bonusWith = (others: string[]) => {
    const team = simulateTeam(
      [
        {
          characterId: 'pyrocountdummy',
          values: parseValues(buildDefaultValues('arlecchino')),
          loaded: counting,
        },
        ...others.map(member),
      ],
      { loop: false, blocks: [block('e', 'pyrocountdummy:skill')] },
      {}
    );
    return team.members[0].context.hitLog[0].extraBonus;
  };

  it('picks the value by how many members are of those elements', () => {
    // Alone 1 Pyro, with Nicole 2, plus Chevreuse 3.
    const one = bonusWith([]);
    expect(bonusWith(['nicole']) - one).toBeCloseTo(1000, 6);
    expect(bonusWith(['nicole', 'chevreuse']) - one).toBeCloseTo(2000, 6);
  });

  it('holds `everyone` only when every member is of those elements', () => {
    expect(bonusWith(['nicole'])).toBeGreaterThan(100000);
    expect(bonusWith(['nicole', 'varesa'])).toBeLessThan(100000);
  });
});

describe('a bonus for everyone (teamBuff "everyone")', () => {
  // Arlecchino's copy: +100% DMG for her and the party, one block.
  const giver = loadCharacterFile(
    editCharacter('arlecchino', (file) => {
      file.id = 'everyonedummy';
      (file.blocks as unknown[]).push({
        id: 'for-everyone',
        type: 'bonus',
        source: 'talent',
        label: 'For everyone: +100% DMG',
        stat: 'dmgBonus',
        value: 100,
        teamBuff: 'everyone',
      });
    })
  );
  const team = simulateTeam(
    [
      {
        characterId: 'everyonedummy',
        values: parseValues(buildDefaultValues('arlecchino')),
        loaded: giver,
      },
      {
        characterId: 'nicole',
        values: parseValues(buildDefaultValues('nicole')),
      },
    ],
    {
      loop: false,
      blocks: [block('e', 'everyonedummy:skill'), block('n', 'nicole:skill')],
    },
    {}
  );
  const firstHit = (id: string) =>
    team.members.find((member) => member.characterId === id)!.context.hitLog[0];

  it('applies to her own hits', () => {
    expect(firstHit('everyonedummy').effectIds).toContain('for-everyone');
  });

  it("applies to the party's hits", () => {
    expect(firstHit('nicole').effectIds).toContain(
      'everyonedummy/for-everyone'
    );
  });
});

describe('default values of a file not registered', () => {
  it('are those of the registered character for its own file', async () => {
    const { buildDefaultValuesFor } = await import('../_lib/simulationValues');
    expect(
      buildDefaultValuesFor(getLoadedCharacter('escoffier').character)
    ).toEqual(buildDefaultValues('escoffier'));
  });
});

describe('active: resource triggers', () => {
  // Two test members: the giver changes `meter` on its E and again 10 s
  // later (by then off the field); the watcher counts both kinds of key.
  const member = (id: string, blocks: Record<string, unknown>[]) => ({
    characterId: id,
    values: parseValues(buildDefaultValues('arlecchino')),
    loaded: loadCharacterFile(
      editCharacter('arlecchino', (file) => {
        Object.assign(file, { id, name: id });
        file.blocks.push(...blocks);
      })
    ),
  });
  const giver = member('giver', [
    resource('meter'),
    trigger('meter-now', { use: 'skill' }, [
      { addResource: 'meter', amount: 10 },
    ]),
    trigger('meter-later', { use: 'skill' }, [
      { addResource: 'meter', amount: 10, delayFrames: 600 },
    ]),
  ]);
  const watcher = member('watcher', [
    trigger('saw-party', { resourceChanges: 'party:meter' }, [
      { count: 'party' },
    ]),
    trigger('saw-active', { resourceChanges: 'active:meter' }, [
      { count: 'active' },
    ]),
  ]);

  it('fires only when the member on the field changed it', () => {
    const team = simulateTeam(
      [giver, watcher],
      {
        loop: false,
        blocks: [
          block('e', toTeamActionId('giver', 'skill')),
          block('n', toTeamActionId('watcher', 'normal'), { hits: 30 }),
        ],
      },
      {}
    );
    const triggers =
      team.members.find((entry) => entry.characterId === 'watcher')!.activity
        ?.triggers ?? {};
    expect(triggers['saw-party']).toHaveLength(2);
    // Only the first: the second came with the giver off the field.
    expect(triggers['saw-active']).toHaveLength(1);
  });
});

describe('Natlan party members in a team', () => {
  const natlanOf = (team: string[]) =>
    simulateTeam(
      team.map((id) => ({
        characterId: id,
        values: parseValues({
          ...buildDefaultValues(id),
          // Typed in by hand: the team's count replaces it.
          numbers: {
            ...buildDefaultValues(id).numbers,
            natlanPartyMembers: '4',
          },
        }),
      })),
      { loop: false, blocks: [block('e', toTeamActionId(team[0], 'skill'))] },
      {}
    ).members.map((entry) => entry.context.values.numbers.natlanPartyMembers);

  it('are counted from the team for every kit with a Nightsoul Burst', () => {
    expect(natlanOf(['mualani', 'nicole'])[0]).toBe(1);
    expect(natlanOf(['mualani', 'varesa', 'nicole']).slice(0, 2)).toEqual([
      2, 2,
    ]);
  });
});

describe('field actions of a member off the field', () => {
  it('swap that member in first, as any step does', () => {
    const team = simulateTeam(
      ['nicole', 'chevreuse'].map((characterId) => ({
        characterId,
        values: parseValues(buildDefaultValues(characterId)),
      })),
      {
        loop: false,
        blocks: [
          block('e', toTeamActionId('nicole', 'skill')),
          block('d', toTeamActionId('chevreuse', 'dodge')),
        ],
      },
      {}
    );
    expect(team.swaps.map((swap) => swap.characterId)).toEqual([
      'nicole',
      'chevreuse',
    ]);
    expect(team.rotationTrace.map((entry) => entry.action)).toEqual([
      'nicole:skill',
      'chevreuse:dodge',
    ]);
  });
});

describe('held actions with a hold time', () => {
  // Mavuika on the Flamestrider: Hold E, then a Charged Attack held for
  // `heldSeconds` (its block's hold time).
  const heldRun = (heldSeconds: number) => {
    const run = runTeam(
      {
        members: [buildMemberValues('mavuika')],
        rotation: {
          loop: false,
          blocks: [
            { ...createTeamBlock('mavuika:skill'), hold: true },
            { ...createTeamBlock('mavuika:charged'), heldSeconds },
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
    const ca = run.trace.find((entry) => entry.action === 'mavuika:charged')!;
    const frames = run.members[0].hitLog
      .filter((hit) => hit.time >= ca.startTime - 1e-6)
      .map((hit) => Math.round((hit.time - ca.startTime) * 60));
    return { frames, length: Math.round((ca.endTime - ca.startTime) * 60) };
  };

  it('repeat their hits every hitEveryFrames up to the release, then the Final', () => {
    // Held to the cap (375 frames): 9 spin hits, the Final at 7.0 s.
    expect(heldRun(6.25).frames).toEqual([
      35, 77, 119, 161, 203, 245, 287, 329, 371, 420,
    ]);
    // 1.3 s (78 frames): two spin hits, the Final 45 frames after release.
    expect(heldRun(1.3).frames).toEqual([35, 77, 123]);
  });

  it('move the end with the release', () => {
    const short = heldRun(1.3);
    const long = heldRun(3);
    expect(long.length - short.length).toBe(180 - 78);
  });
});

describe('a Dash after a held action', () => {
  // Mavuika on the Flamestrider: Hold E, a Charged Attack held 1.3 s (its
  // Final on or off), a Dash.
  const dashRun = (noFinal: boolean) =>
    runTeam(
      {
        members: [buildMemberValues('mavuika')],
        rotation: {
          loop: false,
          blocks: [
            { ...createTeamBlock('mavuika:skill'), hold: true },
            {
              ...createTeamBlock('mavuika:charged'),
              heldSeconds: 1.3,
              noFinal,
            },
            createTeamBlock('mavuika:dodge'),
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
  const caHits = (run: ReturnType<typeof dashRun>) => {
    const ca = run.trace.find((entry) => entry.action === 'mavuika:charged')!;
    return run.members[0].hitLog.filter(
      (hit) => hit.category === 'Charged' && hit.time >= ca.startTime - 1e-6
    ).length;
  };

  it('plays the kit’s own dash while asDodgeWhile holds (the Sprint on the bike)', () => {
    const dash = dashRun(false).trace.at(-1)!;
    expect(dash.performedAction).toBe('mavuika:flamestriderSprint');
  });

  it('with the Final off, the hold is cancelled at the release, with a warning', () => {
    const run = dashRun(true);
    const ca = run.trace.find((entry) => entry.action === 'mavuika:charged')!;
    expect(caHits(run)).toBe(2);
    expect(Math.round((ca.endTime - ca.startTime) * 60)).toBe(78);
    expect(ca.warning).toMatch(/no Final hit/);
  });

  it('with the Final on, the Dash waits for it', () => {
    const run = dashRun(false);
    expect(caHits(run)).toBe(3);
    expect(
      run.trace.find((entry) => entry.action === 'mavuika:charged')!.warning
    ).toBeNull();
  });
});

describe('a status that fills a resource (gain)', () => {
  const file = editCharacter('arlecchino', (character) => {
    character.blocks.push(
      resource('meter', { max: 60 }),
      status('filling', {
        durationFrames: 120,
        gain: { resource: 'meter', amount: 0.5, everyFrames: 3 },
      }),
      trigger('fill', { use: 'probe' }, [{ applyStatus: 'filling' }])
    );
  });

  it('adds every everyFrames while it lasts, and a refresh keeps the rhythm', () => {
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probe'], 0, null);
    // Refreshed at 4: the ticks still land at 3, 6, 9…
    runtime.queue.runUntil(4, Number.POSITIVE_INFINITY);
    runtime.fireTriggers('use', ['probe'], 4, null);
    runtime.queue.runUntil(9, Number.POSITIVE_INFINITY);
    expect(runtime.getResource('meter')).toBe(1.5);
    // It ends 120 frames after the refresh: 41 ticks (3 … 123).
    runtime.queue.runUntil(1000, Number.POSITIVE_INFINITY);
    expect(runtime.getResource('meter')).toBe(20.5);
  });
});

describe('stack counts in amounts and conditions', () => {
  const file = editCharacter('arlecchino', (character) => {
    character.blocks.push(
      resource('seeds', { max: 5, initial: 2 }),
      resource('copied', { max: 5 }),
      status('pip', { stacks: { max: 3, durationFrames: 100 } }),
      trigger('absorb', { use: 'probe' }, [
        { addStack: 'pip', times: { resource: 'seeds' } },
        { setResource: 'copied', value: { stacks: 'pip' }, delayFrames: 1 },
      ])
    );
  });

  it('adds several stacks at once, and reads their count', () => {
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probe'], 0, null);
    runtime.queue.runUntil(5, Number.POSITIVE_INFINITY);
    expect(runtime.getResource('copied')).toBe(2);
    expect(runtime.evaluate({ status: 'pip', gte: 2 }, 5)).toBe(true);
    expect(runtime.evaluate({ status: 'pip', gte: 3 }, 5)).toBe(false);
  });
});

describe('Moonsign', () => {
  const file = (moonsign: number) =>
    editCharacter('arlecchino', (character) => {
      character.moonsign = moonsign;
      character.blocks.push({
        id: 'by-moonsign',
        type: 'bonus',
        source: 'talent',
        label: 'by Moonsign',
        stat: 'critDamage',
        value: [15, 30],
        scaleBy: { moonsign: true },
      });
    });

  it('is Nascent with one, Ascendant with two or more', () => {
    expect(
      createFileRuntime(file(1)).runtime.evaluate({ moonsign: 'nascent' }, 0)
    ).toBe(true);
    expect(
      createFileRuntime(file(2)).runtime.evaluate({ moonsign: 'ascendant' }, 0)
    ).toBe(true);
    expect(
      createFileRuntime(file(0)).runtime.evaluate({ moonsign: 'nascent' }, 0)
    ).toBe(false);
  });

  it('picks a bonus value by level, none without one', () => {
    const critOf = (moonsign: number) => {
      const { context } = simulateFile(file(moonsign), {
        blocks: [block('n', 'normal')],
      });
      return context.hitLog[0].critDamage ?? 0;
    };
    expect(critOf(1) - critOf(0)).toBeCloseTo(0.15);
    expect(critOf(2) - critOf(0)).toBeCloseTo(0.3);
  });
});

describe('a multiplier increase', () => {
  it('scales the hit’s talent multiplier and its other stats’ parts', () => {
    const damageOf = (value: number) => {
      const file = editCharacter('arlecchino', (character) => {
        character.blocks.push({
          id: 'more',
          type: 'bonus',
          source: 'talent',
          label: 'more',
          stat: 'multiplierBonus',
          value,
        });
      });
      return simulateFile(file, { blocks: [block('n', 'normal')] }).context
        .hitLog[0].damage;
    };
    expect(damageOf(24) / damageOf(0)).toBeCloseTo(1.24);
  });
});

describe('a shared resource alone', () => {
  it('is the character’s own', () => {
    const file = editCharacter('arlecchino', (character) => {
      character.blocks.push(
        resource('dew', { max: 3, shared: true }),
        trigger('gain', { use: 'probe' }, [{ addResource: 'dew', amount: 1 }])
      );
    });
    const { runtime } = createFileRuntime(file);
    runtime.fireTriggers('use', ['probe'], 0, null);
    expect(runtime.getResource('dew')).toBe(1);
  });
});

describe('a combo form that starts over (resetsCombo)', () => {
  it('plays N1 of the plain combo when the form gives way', () => {
    // Xilonen with two Pyro/Cryo members: her second kick fills her
    // points and ends the Blessing; the next press is a plain N1.
    const run = runTeam(
      {
        members: ['xilonen', 'mavuika', 'citlali'].map(buildMemberValues),
        rotation: {
          loop: false,
          blocks: [
            createTeamBlock('xilonen:skill'),
            { ...createTeamBlock('xilonen:normal'), hits: 3 },
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 12,
      },
      'expected'
    );
    expect(
      run.trace
        .filter((entry) => entry.action === 'xilonen:normal')
        .map((entry) => [entry.performedAction ?? 'plain', entry.comboIndex])
    ).toEqual([
      ['xilonen:skateNormal', 0],
      ['xilonen:skateNormal', 1],
      // Without resetsCombo the combo would carry on: a plain N3.
      ['plain', 0],
    ]);
  });
});

describe("a dash's charge cancel (quickCancel: Mavuika's CDC)", () => {
  const starts = (
    first: Record<string, unknown>,
    quickCancel: boolean
  ): { dash: number; next: number; warning: string | null } => {
    const run = runTeam(
      {
        members: [buildMemberValues('mavuika')],
        rotation: {
          loop: false,
          blocks: [
            { ...createTeamBlock('mavuika:skill'), hold: true },
            { ...createTeamBlock('mavuika:charged'), ...first },
            { ...createTeamBlock('mavuika:dodge'), quickCancel },
            { ...createTeamBlock('mavuika:charged'), heldSeconds: 0.6 },
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
    const [, , dash, next] = run.trace;
    return {
      dash: Math.round(dash.startTime * 60),
      next: Math.round(next.startTime * 60),
      warning: dash.warning,
    };
  };

  it('starts the next spin 6 frames into the Sprint, not 20', () => {
    const plain = starts({ heldSeconds: 0.6 }, false);
    const cancelled = starts({ heldSeconds: 0.6 }, true);
    expect(plain.next - plain.dash).toBe(20);
    expect(cancelled.dash).toBe(plain.dash);
    expect(cancelled.next - cancelled.dash).toBe(6);
  });

  it('is locked out when the spin before was let go at a locked angle', () => {
    // Let go 83 frames into the spin (no Final): within 79-87.
    const locked = starts({ heldSeconds: 1.38, noFinal: true }, true);
    expect(locked.next - locked.dash).toBe(20);
    expect(locked.warning).toMatch(/^Charge cancel locked out/);
  });
});

describe("a Dash played as a kit dash (Mavuika's Sprint)", () => {
  it('still counts as a Dash for the cancels of what came before', () => {
    // A spin with its Final, then a Dash: the Final cancels into a Dash
    // where it lands (45 frames after the release), not at its end.
    const run = runTeam(
      {
        members: [buildMemberValues('mavuika')],
        rotation: {
          loop: false,
          blocks: [
            { ...createTeamBlock('mavuika:skill'), hold: true },
            { ...createTeamBlock('mavuika:charged'), heldSeconds: 1 },
            createTeamBlock('mavuika:dodge'),
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
        auras: false,
      },
      'expected'
    );
    const [, spin, dash] = run.trace;
    const finalHit = run.members[0].hitLog.find((hit) =>
      hit.row?.endsWith('skillChargeFinal')
    );
    expect(dash.performedAction).toBe('mavuika:flamestriderSprint');
    expect(Math.round(dash.startTime * 60)).toBe(
      Math.round((finalHit?.time ?? 0) * 60)
    );
    expect(Math.round(spin.startTime * 60) + 60 + 45).toBe(
      Math.round(dash.startTime * 60)
    );
  });
});

describe('system blocks (expandSystems)', () => {
  it('are expanded once per character, then reused', () => {
    const mavuika = getLoadedCharacter('mavuika').character;
    const citlali = getLoadedCharacter('citlali').character;
    expect(expandSystems(mavuika)).toBe(expandSystems(mavuika));
    expect(expandSystems(mavuika)).not.toBe(expandSystems(citlali));
    expect(
      expandSystems(mavuika).some((block) => block.id === 'nightsoulBlessing')
    ).toBe(true);
  });
});
