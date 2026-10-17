// Expected-damage cases whose results are pinned in scripts/sim-golden.json.
// Shared by the regression test and by scripts/sim-golden.ts, which
// rewrites that file when a change in results is intended.
import { CHARACTERS } from '../_lib/characters';
import { createDamageContext } from '../_lib/damageEngine';
import { simulateTeam, toTeamActionId } from '../_lib/engine/simulateTeam';
import { computeNormalOnlyRotation } from '../_lib/normalOnlyRotation';
import {
  buildDefaultValues,
  parseValues,
  withFlag,
  withNumber,
} from '../_lib/simulationValues';
import { DEFAULT_SWAP_DELAY_FRAMES } from '../_lib/team';
import { CharacterId, SimulationValues } from '../_lib/types';

export type Change =
  | { flag: string; value: boolean }
  | { number: string; value: number };

export type Case = { id: string; character: CharacterId; changes: Change[] };

const constellationsUpTo = (level: number): Change[] =>
  [1, 2, 3, 4, 5, 6].map((c) => ({ flag: `c${c}`, value: c <= level }));

const constellationCases = (character: CharacterId): Case[] =>
  [0, 1, 2, 3, 4, 5, 6].map((level) => ({
    id: `${character}/c${level}`,
    character,
    changes: constellationsUpTo(level),
  }));

export const CASES: Case[] = [
  ...constellationCases('arlecchino'),
  {
    id: 'arlecchino/no-wait-blood-debt',
    character: 'arlecchino',
    changes: [{ flag: 'waitForBloodDebtDue', value: false }],
  },
  {
    id: 'arlecchino/no-crimson-moon',
    character: 'arlecchino',
    changes: [{ flag: 'crimsonMoon', value: false }],
  },
  {
    id: 'arlecchino/no-whimsy',
    character: 'arlecchino',
    changes: [{ flag: 'harmonicWhimsy4', value: false }],
  },
  {
    id: 'arlecchino/start-bond-145',
    character: 'arlecchino',
    changes: [{ number: 'bond', value: 145 }],
  },
  {
    id: 'arlecchino/c6-start-bond-145',
    character: 'arlecchino',
    changes: [...constellationsUpTo(6), { number: 'bond', value: 145 }],
  },
  ...constellationCases('mualani'),
  {
    id: 'mualani/vaporize',
    character: 'mualani',
    changes: [{ flag: 'vaporize', value: true }],
  },
  // Two Bursts: Wavechaser's Exploits stacks expire after 20 s.
  {
    id: 'mualani/120s',
    character: 'mualani',
    changes: [{ number: 'duration', value: 120 }],
  },
  {
    id: 'mualani/120s-natlan-3',
    character: 'mualani',
    changes: [
      { number: 'duration', value: 120 },
      { number: 'natlanPartyMembers', value: 3 },
    ],
  },
  {
    id: 'mualani/120s-er-200',
    character: 'mualani',
    changes: [
      { number: 'duration', value: 120 },
      { number: 'energyRecharge', value: 200 },
    ],
  },
  {
    id: 'mualani/vaporize-em-200',
    character: 'mualani',
    changes: [
      { flag: 'vaporize', value: true },
      { number: 'em', value: 200 },
    ],
  },
  {
    id: 'mualani/no-burst',
    character: 'mualani',
    changes: [{ flag: 'useBurst', value: false }],
  },
  {
    id: 'mualani/no-surfs-up',
    character: 'mualani',
    changes: [{ flag: 'surfsUp', value: false }],
  },
  {
    id: 'mualani/no-obsidian-4',
    character: 'mualani',
    changes: [{ flag: 'obsidian4', value: false }],
  },
  // The defaults turn C1 on, so they are not the same as varesa/c0.
  { id: 'varesa/defaults', character: 'varesa', changes: [] },
  ...constellationCases('varesa'),
  {
    id: 'varesa/no-charged-filler',
    character: 'varesa',
    changes: [{ flag: 'chargedFiller', value: false }],
  },
  {
    id: 'varesa/no-use-burst',
    character: 'varesa',
    changes: [{ flag: 'useBurst', value: false }],
  },
  {
    id: 'varesa/120s',
    character: 'varesa',
    changes: [{ number: 'duration', value: 120 }],
  },
  {
    id: 'varesa/team-overloaded',
    character: 'varesa',
    changes: [{ flag: 'teamOverloaded', value: true }],
  },
  {
    id: 'varesa/team-full',
    character: 'varesa',
    changes: [
      'teamOverloaded',
      'teamIansan',
      'teamIansanC2',
      'teamScroll',
      'teamChevreuse',
      'teamChevreuseC1',
      'teamChevreuseC6',
      'teamNicole',
      'teamNicoleQ',
    ].map((flag) => ({ flag, value: true })),
  },
  // Supports: their own damage (the team buffs are in their details).
  {
    id: 'iansan/defaults',
    character: 'iansan',
    changes: constellationsUpTo(6),
  },
  { id: 'iansan/c0', character: 'iansan', changes: constellationsUpTo(0) },
  {
    id: 'iansan/no-favonius',
    character: 'iansan',
    changes: [{ flag: 'favonius', value: false }],
  },
  {
    id: 'iansan/movement-3',
    character: 'iansan',
    changes: [{ number: 'iansanMovementPoints', value: 3 }],
  },
  { id: 'chevreuse/defaults', character: 'chevreuse', changes: [] },
  {
    id: 'chevreuse/c0',
    character: 'chevreuse',
    changes: constellationsUpTo(0),
  },
  {
    id: 'chevreuse/no-overloaded',
    character: 'chevreuse',
    changes: [{ flag: 'overloaded', value: false }],
  },
  { id: 'nicole/defaults', character: 'nicole', changes: [] },
  { id: 'nicole/c6', character: 'nicole', changes: constellationsUpTo(6) },
];

export const NORMAL_ONLY_CASES: Case[] = [
  { id: 'arlecchino/normal-only', character: 'arlecchino', changes: [] },
  {
    id: 'arlecchino/normal-only-no-charged',
    character: 'arlecchino',
    changes: [{ flag: 'normalOnlyChargedBond', value: false }],
  },
  {
    id: 'arlecchino/normal-only-no-crimson-moon',
    character: 'arlecchino',
    changes: [{ flag: 'crimsonMoon', value: false }],
  },
];

export const applyChanges = (testCase: Case): SimulationValues =>
  testCase.changes.reduce((values, change) => {
    if ('flag' in change) {
      return withFlag(values, change.flag, change.value);
    }
    return withNumber(values, change.number, String(change.value));
  }, buildDefaultValues(testCase.character));

const expectedDps = (testCase: Case): number => {
  const values = applyChanges(testCase);
  const parsed = parseValues(values);
  const context = createDamageContext(parsed, 'expected');
  CHARACTERS[values.character].simulate(context, parsed);
  return context.totalDamage / Math.max(1, parsed.numbers.duration ?? 1);
};

const normalOnlyDps = (testCase: Case): number =>
  computeNormalOnlyRotation(parseValues(applyChanges(testCase))).averageDps;

// How much a case moved from its pinned value, in %. From 0, any change
// is infinitely large.
export const goldenChangePercent = (before: number, after: number): number => {
  if (before === 0) {
    return after === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return ((after - before) / before) * 100;
};

// Teams: each member's defaults (plus changes) and a looping rotation of
// [member, action].
type TeamCase = {
  id: string;
  members: { character: CharacterId; changes: Change[] }[];
  rotation: [CharacterId, string][];
};

// The team screen's first preset (its first 15 s), kept as it was so the
// pinned result does not move when the screen's preset changes.
const VARESA_TEAM_ROTATION: TeamCase['rotation'] = [
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['nicole', 'skill'],
  ['chevreuse', 'burst'],
  ['chevreuse', 'skillHold'],
  ['iansan', 'skill'],
  ['iansan', 'burst'],
  ['varesa', 'eSpecial'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'qSpecial'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'eSpecial'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'qSpecial'],
  ['varesa', 'skill'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'eSpecial'],
  ['varesa', 'charged'],
  ['varesa', 'plunge'],
  ['varesa', 'qSpecial'],
];

export const TEAM_CASES: TeamCase[] = [
  {
    id: 'team/varesa-iansan-chevreuse-nicole',
    members: [
      // The enemy's auras make Overloaded: no "every … s" option.
      {
        character: 'iansan',
        changes: [{ flag: 'overloaded', value: false }],
      },
      {
        character: 'chevreuse',
        changes: [{ flag: 'overloaded', value: false }],
      },
      { character: 'nicole', changes: [] },
      { character: 'varesa', changes: [] },
    ],
    rotation: VARESA_TEAM_ROTATION,
  },
];

const teamDps = (testCase: TeamCase): number => {
  const team = simulateTeam(
    testCase.members.map(({ character, changes }) => ({
      characterId: character,
      values: parseValues(applyChanges({ id: '', character, changes })),
    })),
    {
      loop: false,
      blocks: testCase.rotation.map(([character, action], index) => ({
        uid: `b${index}`,
        action: toTeamActionId(character, action),
        hits: 1,
        repeat: 1,
        seconds: 0,
        dashCancel: false,
      })),
    },
    // As the team screen plays it.
    { auras: true, swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES }
  );
  return team.totalDamage / (team.durationFrames / 60);
};

// Expected DPS of every case, rounded to cents.
export const runGoldenCases = (): Record<string, number> =>
  Object.fromEntries([
    ...CASES.map((c) => [c.id, Math.round(expectedDps(c) * 100) / 100]),
    ...NORMAL_ONLY_CASES.map((c) => [
      c.id,
      Math.round(normalOnlyDps(c) * 100) / 100,
    ]),
    ...TEAM_CASES.map((c) => [c.id, Math.round(teamDps(c) * 100) / 100]),
  ]);
