import { describe, expect, it } from 'vitest';

import { toTeamActionId } from '../_lib/engine/simulateTeam';
import {
  buildDefaultTeam,
  buildMemberValues,
  createTeamBlock,
  getActionBonuses,
  getActionStats,
  getCharacterState,
  getTeamSnapshot,
  runTeam,
  TeamRun,
} from '../_lib/team';

describe("each member's state at a moment of the team rotation", () => {
  const run = runTeam(
    {
      members: [buildMemberValues('iansan'), buildMemberValues('varesa')],
      rotation: {
        loop: false,
        blocks: [
          createTeamBlock(toTeamActionId('iansan', 'skill')),
          createTeamBlock(toTeamActionId('iansan', 'burst')),
          createTeamBlock(toTeamActionId('varesa', 'normal')),
        ],
      },
      fillWhileWaiting: false,
      swapDelayFrames: 0,
    },
    'expected'
  );
  const start = (action: string) =>
    run.trace.find((entry) => entry.action === action)?.startTime ?? 0;
  const qStart = start(toTeamActionId('iansan', 'burst'));
  const eStart = start(toTeamActionId('iansan', 'skill'));
  const varesaStart = start(toTeamActionId('varesa', 'normal'));

  it('shows the state just before an action: its own cost is not spent yet', () => {
    const [iansan] = getTeamSnapshot(run, qStart);
    expect(iansan.onField).toBe(true);
    expect(iansan.energy).toEqual({ value: 70, max: 70 });
    expect(iansan.burst.remaining).toBe(0);
  });

  it('shows cooldowns running and who is on the field', () => {
    const [iansan, varesa] = getTeamSnapshot(run, varesaStart);
    expect(varesa.onField).toBe(true);
    expect(iansan.onField).toBe(false);
    expect(iansan.burst.remaining).toBeCloseTo(18 - (varesaStart - qStart), 1);
    expect(iansan.skill.remaining).toBeCloseTo(16 - (varesaStart - eStart), 1);
    expect(iansan.energy?.value).toBeLessThan(70);
    expect(iansan.statuses).toContain('Kinetic Energy Scale');
    expect(iansan.points?.value).toBeGreaterThan(0);
  });

  it('never counts more stacks than a status can have', () => {
    const team = runTeam(
      {
        members: [buildMemberValues('varesa')],
        rotation: {
          loop: true,
          blocks: ['skill', 'charged', 'plunge'].map((action) =>
            createTeamBlock(toTeamActionId('varesa', action))
          ),
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
      },
      'expected'
    );
    const counts = team.trace.flatMap((entry) =>
      getTeamSnapshot(team, entry.startTime)[0].statuses.flatMap((status) => {
        const match = status.match(/Radiance Everlasting ×(\d+)/);
        return match ? [Number(match[1])] : [];
      })
    );
    expect(Math.max(...counts)).toBe(5);
  });

  it('shows a recharging charge even while another one is ready', () => {
    const team = runTeam(
      {
        members: [buildMemberValues('varesa')],
        rotation: {
          loop: false,
          blocks: ['skill', 'charged', 'plunge'].map((action) =>
            createTeamBlock(toTeamActionId('varesa', action))
          ),
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
      },
      'expected'
    );
    const plunge = team.trace.find(
      (entry) => entry.action === toTeamActionId('varesa', 'plunge')
    );
    const [varesa] = getTeamSnapshot(team, plunge?.startTime ?? 0);
    // One of her 2 charges was used: 9 s minus the time since.
    expect(varesa.skill.ready).toBe(1);
    expect(varesa.skill.remaining).toBe(0);
    expect(varesa.skill.recharging).toBeCloseTo(
      9 - (plunge?.startTime ?? 0),
      1
    );
  });
});

describe('bonuses on an action of the team rotation', () => {
  const team = runTeam(
    {
      members: [buildMemberValues('iansan'), buildMemberValues('varesa')],
      rotation: {
        loop: false,
        blocks: [
          createTeamBlock(toTeamActionId('iansan', 'skill')),
          createTeamBlock(toTeamActionId('iansan', 'burst')),
          createTeamBlock(toTeamActionId('varesa', 'skill')),
          createTeamBlock(toTeamActionId('varesa', 'charged')),
          createTeamBlock(toTeamActionId('varesa', 'plunge')),
        ],
      },
      fillWhileWaiting: false,
      swapDelayFrames: 0,
    },
    'expected'
  );
  const plunge = team.trace.find(
    (entry) => entry.action === toTeamActionId('varesa', 'plunge')
  );
  const bonuses = getActionBonuses(team, plunge?.blockUid ?? '');

  it('lists her own bonuses with where they come from and their value', () => {
    const longNight = bonuses.find((bonus) => bonus.id === 'long-night-2pc');
    expect(longNight).toMatchObject({
      source: 'artifact',
      from: 'Varesa',
      value: '+25% Plunge DMG',
    });
    expect(longNight?.iconUrl).toMatch(/UI_RelicIcon_15039/);
  });

  it("lists teammates' buffs as theirs", () => {
    const c2 = bonuses.find((bonus) => bonus.id === 'iansan/c2-atk');
    expect(c2).toMatchObject({
      source: 'constellation',
      from: 'Iansan',
      value: '+30% ATK',
    });
    expect(c2?.iconUrl).toMatch(/UI_Talent_S_Iansan_02/);
  });

  it('gives each bonus the time it has left, or none when permanent', () => {
    const time = plunge?.startTime ?? 0;
    const longNight = bonuses.find((bonus) => bonus.id === 'long-night-2pc');
    expect(longNight?.remaining).toBeNull();
    // C2 lasts as long as Precise Movement (15 s from the Q), ended early
    // only by her Blessing.
    const c2 = bonuses.find((bonus) => bonus.id === 'iansan/c2-atk');
    const iansan = team.members.find(
      (member) => member.characterId === 'iansan'
    );
    const precise = iansan?.activity?.statuses.preciseMovement?.find(
      ({ start, end }) => start / 60 <= time && time < end / 60
    );
    expect(c2?.remaining).toBeGreaterThan(0);
    expect(c2?.remaining).toBeCloseTo((precise?.end ?? 0) / 60 - c2!.time, 6);
  });
});

describe('bonus timers with refreshes', () => {
  it('counts down the current Grace of Kenosis, not until its last refresh', () => {
    const team = runTeam(
      {
        members: [buildMemberValues('nicole'), buildMemberValues('varesa')],
        rotation: {
          loop: false,
          blocks: [
            createTeamBlock(toTeamActionId('nicole', 'skill')),
            createTeamBlock(toTeamActionId('varesa', 'skill')),
            createTeamBlock(toTeamActionId('varesa', 'charged')),
            createTeamBlock(toTeamActionId('varesa', 'plunge')),
            createTeamBlock(toTeamActionId('nicole', 'skill')),
            createTeamBlock(toTeamActionId('varesa', 'normal')),
          ],
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
      },
      'expected'
    );
    const eStart =
      team.trace.find(
        (entry) => entry.action === toTeamActionId('nicole', 'skill')
      )?.startTime ?? 0;
    const plunge = team.trace.find(
      (entry) => entry.action === toTeamActionId('varesa', 'plunge')
    );
    const grace = getActionBonuses(team, plunge?.blockUid ?? '').find(
      (bonus) => bonus.id === 'nicole/grace'
    );
    // 20 s from the E (applied 8 frames in), not up to the refreshed one's end.
    expect(grace?.remaining).toBeCloseTo(eStart + 8 / 60 + 20 - grace!.time, 1);
  });
});

describe('what each bonus raises', () => {
  const team = runTeam(buildDefaultTeam(), 'expected');
  const kablam = team.trace.find((entry) =>
    /kablam/.test(entry.performedAction ?? '')
  );
  const valueOf = (id: string) =>
    getActionBonuses(team, kablam?.blockUid ?? '').find(
      (bonus) => bonus.id === id
    )?.value;

  it('names the stat and what it applies to', () => {
    expect(valueOf('nicole/angelos-party')).toBe('+26% Elemental DMG');
    expect(valueOf('long-night-4pc')).toBe('5 stacks +75% Plunge DMG');
    expect(valueOf('chevreuse/a1-shred')).toBe('-40% Pyro/Electro RES');
    expect(valueOf('chevreuse/a4-atk')).toBe('+40% ATK');
    expect(valueOf('rainbow-crash')).toMatch(/^\+[\d,.]+ Plunge DMG \(flat\)$/);
  });
});

describe("the hitter's stats on an action", () => {
  const team = runTeam(buildDefaultTeam(), 'expected');
  const kablam = team.trace.find((entry) =>
    /kablam/.test(entry.performedAction ?? '')
  );
  const stats = getActionStats(team, kablam?.blockUid ?? '');

  it('shows the scaling stat with every buff, CRIT and DMG Bonus at the hit', () => {
    const hit = team.members
      .find((member) => member.characterId === 'varesa')
      ?.hitLog.find((entry) => entry.blockUid === kablam?.blockUid);
    expect(stats).toMatchObject({
      name: 'Varesa',
      statLabel: 'ATK',
      critRate: hit?.critRate,
      dmgBonus: hit?.totalBonus,
    });
    // Her screen ATK (2,128) plus the team's buffs.
    expect(stats?.stat).toBeGreaterThan(2128);
    expect(stats?.critDamage).toBeCloseTo(1.829, 6);
  });
});

describe("the Event panel's character state", () => {
  const solo = (characterId: string, actions: string[]) =>
    runTeam(
      {
        members: [buildMemberValues(characterId)],
        rotation: {
          loop: false,
          blocks: actions.map((action) =>
            createTeamBlock(toTeamActionId(characterId, action))
          ),
        },
        fillWhileWaiting: false,
        swapDelayFrames: 0,
      },
      'expected'
    );
  const startOf = (run: TeamRun, action: string) =>
    run.trace.find((entry) => entry.action === action)?.startTime ?? 0;

  it("shows Varesa's Nightsoul points, Energy and Lost Prayer stacks", () => {
    const run = solo('varesa', ['skill', 'charged', 'plunge', 'normal']);
    const normalStart = startOf(run, toTeamActionId('varesa', 'normal'));
    const state = getCharacterState(run.members[0], normalStart + 0.1, null);
    expect(state.mechanic).toMatchObject({ id: 'nightsoul', max: 40 });
    expect(state.energy).toMatchObject({ id: 'energy', max: 70 });
    expect(state.weapon).toMatchObject({
      label: 'Lost Prayer to the Sacred Winds',
      max: 4,
    });
    expect(state.weapon.value).toBeGreaterThanOrEqual(0);
  });

  // Her Charged Attack absorbs the Directive her E left: Bond of Life.
  it("shows Arlecchino's Bond of Life, as a %, and what an action changed", () => {
    const run = solo('arlecchino', ['skill', 'charged', 'normal']);
    const chargedStart = startOf(run, toTeamActionId('arlecchino', 'charged'));
    const normalStart = startOf(run, toTeamActionId('arlecchino', 'normal'));
    const state = getCharacterState(run.members[0], normalStart, chargedStart);
    expect(state.mechanic).toMatchObject({
      id: 'bondOfLife',
      format: 'percent',
      before: 0,
      max: 200,
    });
    expect(state.mechanic?.value).toBeGreaterThan(0);
  });

  it("shows the E and the Q as in-game: Varesa's two E charges and the Q's Energy", () => {
    const run = solo('varesa', ['normal']);
    const state = getCharacterState(run.members[0], 0.5, null);
    expect(state.skill).toMatchObject({
      icon: 'Skill_S_Varesa_01',
      form: null,
      cooldown: { ready: 2, charges: 2 },
    });
    expect(state.burst).toMatchObject({
      icon: 'Skill_E_Varesa_01',
      form: null,
    });
    expect(state.energy?.max).toBe(70);
  });

  it('shows the E as its Fiery Passion form, with its own icon', () => {
    const run = solo('varesa', ['skill', 'charged', 'plunge', 'normal']);
    const normalStart = startOf(run, toTeamActionId('varesa', 'normal'));
    const state = getCharacterState(run.members[0], normalStart + 0.1, null);
    expect(state.skill.icon).toBe('Skill_S_Varesa_02');
    expect(state.skill.form).toMatch(/Fiery Passion Rush/);
    // The E used before is recharging: one charge left.
    expect(state.skill.cooldown.ready).toBe(1);
    expect(state.skill.cooldown.recharging).toBeGreaterThan(0);
  });

  it('keeps the weapon row for a weapon without stacks, with no value', () => {
    const run = solo('chevreuse', ['skill']);
    const state = getCharacterState(run.members[0], 1, 0);
    expect(state.mechanic).toBeNull();
    expect(state.weapon).toMatchObject({
      label: 'Favonius Lance',
      value: null,
    });
  });
});
