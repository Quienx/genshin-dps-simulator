// Lunar-Bloom in a team: Dendro and Hydro auras make Bloom, which a
// Nod-Krai member (`lunarReactions`) turns into Lunar-Bloom; the party then
// gathers Verdant Dew (a resource every member shares) and Lunar hits use
// gcsim's direct Lunar formula. Nefer and Columbina are checked against
// gcsim (PR #3045's Nefer) with the same rotation.
import { describe, expect, it } from 'vitest';

import { block, editCharacter } from './fixtures';
import { loadCharacterFile } from '../_lib/characterData';
import { addLunarHit, createDamageContext } from '../_lib/damageEngine';
import {
  createVerdantDewClock,
  VERDANT_DEW_ID,
} from '../_lib/engine/modules/verdantDew';
import { createEventQueue } from '../_lib/engine/queue';
import { simulateTeam, toTeamActionId } from '../_lib/engine/simulateTeam';
import { buildDefaultValues, parseValues } from '../_lib/simulationValues';

const member = (id: 'nefer' | 'columbina') => ({
  characterId: id,
  values: parseValues(buildDefaultValues(id)),
});

const play = (
  team: ReturnType<typeof member>[],
  steps: [string, string][],
  durationSteps = 1
) =>
  simulateTeam(
    team,
    {
      loop: false,
      blocks: Array.from({ length: durationSteps }).flatMap((_, round) =>
        steps.map(([id, action], index) =>
          block(`b${round}-${index}`, toTeamActionId(id, action))
        )
      ),
    },
    { auras: true, swapDelayFrames: 12, critMode: 'expected' }
  );

const reactionsOf = (team: ReturnType<typeof play>) =>
  team.events
    .filter((event) => event.kind === 'aura' && event.detail?.reaction)
    .map((event) => String(event.detail?.reaction));

const GCSIM_ROTATION: [string, string][] = [
  ['columbina', 'skill'],
  ['columbina', 'burst'],
  ['nefer', 'skill'],
  ['nefer', 'normal'],
  ['nefer', 'normal'],
  ['nefer', 'charged'],
  ['nefer', 'normal'],
  ['nefer', 'normal'],
  ['nefer', 'charged'],
];

describe('Bloom in a team', () => {
  it('is Lunar-Bloom with a member that turns it Lunar', () => {
    const team = play(
      [member('columbina'), member('nefer')],
      [
        ['columbina', 'skill'],
        ['nefer', 'skill'],
      ]
    );
    expect(reactionsOf(team)).toContain('Lunar-Bloom');
    expect(reactionsOf(team)).not.toContain('Bloom');
  });

  it('stays Bloom without one (no Dendro Cores: it deals nothing)', () => {
    const plain = (id: 'nefer' | 'columbina') => ({
      ...member(id),
      loaded: loadCharacterFile(
        editCharacter(id, (file) => {
          Object.assign(file, { lunarReactions: [] });
        })
      ),
    });
    const team = play(
      [plain('columbina'), plain('nefer')],
      [
        ['columbina', 'skill'],
        ['nefer', 'skill'],
      ]
    );
    expect(reactionsOf(team)).toContain('Bloom');
    expect(reactionsOf(team)).not.toContain('Lunar-Bloom');
  });
});

describe('Verdant Dew', () => {
  it('gathers one Dew every 146 frames of its 149-frame window', () => {
    const queue = createEventQueue();
    const gained: number[] = [];
    let dew = 0;
    const clock = createVerdantDewClock({
      queue,
      getDew: () => dew,
      gain: (frame) => {
        dew += 1;
        gained.push(frame);
      },
    });
    clock.onLunarBloom(0);
    queue.runUntil(1000, 1000);
    // Frames 1-146 make the first; the window ends at 149.
    expect(gained).toEqual([146]);
    clock.onLunarBloom(1000);
    clock.onLunarBloom(1100);
    queue.runUntil(2000, 2000);
    // The second reaction extends the window; the partial count is kept
    // between windows (frames 147-149 counted 3), as in gcsim.
    expect(gained).toEqual([146, 1143]);
  });

  it('is one value for the whole party, spent by either member', () => {
    const team = play([member('columbina'), member('nefer')], GCSIM_ROTATION);
    const dewOf = (id: string) =>
      team.events
        .filter(
          (event) =>
            event.kind === 'resource' &&
            event.blockId === VERDANT_DEW_ID &&
            event.characterId === id
        )
        .map((event) => [event.frame, event.detail?.value]);
    expect(dewOf('nefer').length).toBeGreaterThan(0);
    expect(dewOf('nefer')).toEqual(dewOf('columbina'));
  });
});

describe('a Lunar hit', () => {
  it('is base DMG × (1 + Base bonus) × Lunar multiplier, no DEF, then RES and CRIT', () => {
    const context = createDamageContext(
      parseValues(buildDefaultValues('nefer')),
      'expected'
    );
    addLunarHit(context, {
      category: 'Lunar-Bloom',
      element: 'Dendro',
      stat: 1000,
      multiplier: 100,
      statDamage: 1000,
      baseBonus: 0.1,
      lunarMultiplier: 2,
      elevation: 0.5,
    });
    const [hit] = context.hitLog;
    expect(hit.defMultiplier).toBe(1);
    expect(hit.baseDamage).toBeCloseTo(1100);
    // Lunar × (1 + Elevation).
    expect(hit.reactionMultiplier).toBeCloseTo(3);
    expect(hit.damage).toBeCloseTo(
      1100 * 3 * hit.resMultiplier! * hit.critMultiplier!
    );
  });
});

describe('Nefer and Columbina against gcsim', () => {
  // gcsim (dersario/gcsim@nefer, 1000 iterations): 372,789 DMG in 60 s
  // with the same builds and this rotation; Columbina's 168,7xx and
  // Nefer's Phantasm Shades within 1%.
  it('deal what gcsim deals with the same rotation', () => {
    const team = play([member('columbina'), member('nefer')], GCSIM_ROTATION);
    expect(team.totalDamage / 372789).toBeGreaterThan(0.98);
    expect(team.totalDamage / 372789).toBeLessThan(1.02);
  });

  it('play Phantasm Performance with the party’s Dew', () => {
    const team = play([member('columbina'), member('nefer')], GCSIM_ROTATION);
    const phantasms = team.rotationTrace.filter(
      (entry) => entry.performedAction === 'nefer:phantasm'
    );
    expect(phantasms).toHaveLength(2);
  });
});
