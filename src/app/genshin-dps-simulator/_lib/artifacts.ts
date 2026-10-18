import { CharacterData, ScreenStat } from './characterSchema';
import formatNumber from './formatNumber';
import {
  ArtifactBuild,
  ArtifactLine,
  ArtifactSlot,
  ParsedValues,
} from './types';
import { getWeaponRefinement } from './weapons';

export const ARTIFACT_SLOTS: ArtifactSlot[] = [
  'flower',
  'plume',
  'sands',
  'goblet',
  'circlet',
];

export const SUBSTATS_PER_PIECE = 4;

// What the stat lines read, for the editor.
export const SCREEN_STAT_LABELS: Record<ScreenStat, string> = {
  flatHp: 'HP',
  flatAtk: 'ATK',
  flatDef: 'DEF',
  hpPercent: 'HP%',
  atkPercent: 'ATK%',
  defPercent: 'DEF%',
  elementalMastery: 'EM',
  energyRecharge: 'ER%',
  critRate: 'CRIT Rate%',
  critDamage: 'CRIT DMG%',
  elementalDmg: 'Elemental DMG%',
};

// The main stats each piece can roll, with a 5-star +20 piece's value
// (filled in when the main stat is picked).
export const MAIN_STATS: Record<
  ArtifactSlot,
  { stat: ScreenStat; value: number }[]
> = {
  flower: [{ stat: 'flatHp', value: 4780 }],
  plume: [{ stat: 'flatAtk', value: 311 }],
  sands: [
    { stat: 'atkPercent', value: 46.6 },
    { stat: 'hpPercent', value: 46.6 },
    { stat: 'defPercent', value: 58.3 },
    { stat: 'elementalMastery', value: 186.5 },
    { stat: 'energyRecharge', value: 51.8 },
  ],
  goblet: [
    { stat: 'elementalDmg', value: 46.6 },
    { stat: 'atkPercent', value: 46.6 },
    { stat: 'hpPercent', value: 46.6 },
    { stat: 'defPercent', value: 58.3 },
    { stat: 'elementalMastery', value: 186.5 },
  ],
  circlet: [
    { stat: 'critRate', value: 31.1 },
    { stat: 'critDamage', value: 62.2 },
    { stat: 'atkPercent', value: 46.6 },
    { stat: 'hpPercent', value: 46.6 },
    { stat: 'defPercent', value: 58.3 },
    { stat: 'elementalMastery', value: 186.5 },
  ],
};

export const SUBSTATS: ScreenStat[] = [
  'critRate',
  'critDamage',
  'atkPercent',
  'flatAtk',
  'hpPercent',
  'flatHp',
  'defPercent',
  'flatDef',
  'elementalMastery',
  'energyRecharge',
];

// Each piece with its first main stat and no substats yet.
export const createDefaultArtifacts = (): ArtifactBuild => ({
  enabled: false,
  pieces: Object.fromEntries(
    ARTIFACT_SLOTS.map((slot) => {
      const [main] = MAIN_STATS[slot];
      return [
        slot,
        {
          main: { stat: main.stat, value: String(main.value) },
          subs: Array.from({ length: SUBSTATS_PER_PIECE }, () => ({
            stat: '',
            value: '',
          })),
        },
      ];
    })
  ) as ArtifactBuild['pieces'],
});

// The totals the stat fields hold: the names `parseValues` replaces.
export type ScreenTotals = {
  atk: number;
  hp: number;
  def: number;
  em: number;
  cr: number;
  cd: number;
  energyRecharge: number;
  elementalBonus: number;
};

// The stat fields computed while artifacts are on (hidden from the form).
export const COMPUTED_STAT_FIELDS = new Set<string>([
  'atk',
  'hp',
  'def',
  'em',
  'cr',
  'cd',
  'energyRecharge',
  'elementalBonus',
]);

// Every character starts with 5% CRIT Rate, 50% CRIT DMG and 100% ER.
const BASE_TOTALS: Partial<Record<ScreenStat, number>> = {
  critRate: 5,
  critDamage: 50,
  energyRecharge: 100,
};

const lineValue = (line: ArtifactLine): number => {
  const value = Number(line.value);
  return line.stat !== '' && line.value.trim() !== '' && Number.isFinite(value)
    ? value
    : 0;
};

// The character screen's totals, as the game adds them: base stats ×
// (1 + %) + flat, plus ascension, the weapon's substat and on-screen
// passives, the set's on-screen 2-piece and the five pieces. Conditional
// bonuses are left to the kit's blocks, as with typed totals.
export const computeScreenStats = (
  character: CharacterData,
  values: ParsedValues,
  artifacts: ArtifactBuild
): ScreenTotals => {
  const sums: Partial<Record<ScreenStat, number>> = { ...BASE_TOTALS };
  const add = (stat: ScreenStat | '', value: number) => {
    if (stat !== '') {
      sums[stat] = (sums[stat] ?? 0) + value;
    }
  };

  add(character.ascensionStat.stat, character.ascensionStat.value);
  const { substat } = character.weapon;
  // Physical DMG is the `physicalBonus` value, not a screen stat.
  if (substat.stat !== 'physicalDmg') {
    add(substat.stat, substat.value);
  }
  const refinement = getWeaponRefinement(character.weapon, values);
  character.weapon.rows.forEach((row) => {
    const byRefinement = row.screenStat && row.params?.[row.screenStat.param];
    if (row.screenStat && byRefinement) {
      add(
        row.screenStat.stat,
        byRefinement[Math.min(refinement, byRefinement.length) - 1]
      );
    }
  });
  character.artifactSet.screenStats.forEach(({ stat, value }) =>
    add(stat, value)
  );
  ARTIFACT_SLOTS.forEach((slot) => {
    const piece = artifacts.pieces[slot];
    [piece.main, ...piece.subs].forEach((line) =>
      add(line.stat, lineValue(line))
    );
  });

  const sum = (stat: ScreenStat) => sums[stat] ?? 0;
  const baseAtk = character.baseStats.atk + character.weapon.baseAtk;
  return {
    atk: baseAtk * (1 + sum('atkPercent') / 100) + sum('flatAtk'),
    hp: character.baseStats.hp * (1 + sum('hpPercent') / 100) + sum('flatHp'),
    def:
      character.baseStats.def * (1 + sum('defPercent') / 100) + sum('flatDef'),
    em: character.baseStats.em + sum('elementalMastery'),
    cr: sum('critRate'),
    cd: sum('critDamage'),
    energyRecharge: sum('energyRecharge'),
    elementalBonus: sum('elementalDmg'),
  };
};

// What a weapon and a set add to the screen's totals: the weapon's base
// ATK, its substat, its on-screen passive (by refinement) and the set's
// on-screen 2-piece. Physical DMG is the `physicalBonus` value.
type GearStat = ScreenStat | 'physicalDmg';
const gearContribution = (
  character: CharacterData,
  values: ParsedValues
): { baseAtk: number; sums: Partial<Record<GearStat, number>> } => {
  const sums: Partial<Record<GearStat, number>> = {};
  const add = (stat: GearStat, value: number) => {
    sums[stat] = (sums[stat] ?? 0) + value;
  };
  const { weapon, artifactSet } = character;
  add(weapon.substat.stat, weapon.substat.value);
  const refinement = getWeaponRefinement(weapon, values);
  weapon.rows.forEach((row) => {
    const byRefinement = row.screenStat && row.params?.[row.screenStat.param];
    if (row.screenStat && byRefinement) {
      add(
        row.screenStat.stat,
        byRefinement[Math.min(refinement, byRefinement.length) - 1]
      );
    }
  });
  artifactSet.screenStats.forEach(({ stat, value }) => add(stat, value));
  return { baseAtk: weapon.baseAtk, sums };
};

// The plume's ATK: the flat ATK a typed ATK total is assumed to hold, to
// tell its ATK% apart (the substats' flat ATK is not known).
const ASSUMED_FLAT_ATK = 311;

// Typed screen totals with other gear: what the old weapon and set added
// comes off and what the new ones add goes on. ATK keeps the build's ATK%
// (read from the total, assuming the plume's flat ATK) over the new base
// ATK; additive stats move by the difference.
export const swapGearTotals = (
  numbers: Record<string, number>,
  from: { character: CharacterData; values: ParsedValues },
  to: { character: CharacterData; values: ParsedValues }
): Record<string, number> => {
  const old = gearContribution(from.character, from.values);
  const next = gearContribution(to.character, to.values);
  const delta = (stat: GearStat) =>
    (next.sums[stat] ?? 0) - (old.sums[stat] ?? 0);
  const result = { ...numbers };
  const shift = (field: string, stat: GearStat) => {
    if (delta(stat) !== 0) {
      result[field] = (result[field] ?? 0) + delta(stat);
    }
  };
  shift('em', 'elementalMastery');
  shift('cr', 'critRate');
  shift('cd', 'critDamage');
  shift('energyRecharge', 'energyRecharge');
  shift('elementalBonus', 'elementalDmg');
  shift('physicalBonus', 'physicalDmg');

  const { baseStats } = to.character;
  if (numbers.atk !== undefined) {
    const oldBase = baseStats.atk + old.baseAtk;
    const newBase = baseStats.atk + next.baseAtk;
    const flat = ASSUMED_FLAT_ATK + delta('flatAtk');
    const percent =
      (numbers.atk - ASSUMED_FLAT_ATK) / oldBase -
      1 +
      delta('atkPercent') / 100;
    result.atk = newBase * (1 + percent) + flat;
  }
  if (numbers.hp !== undefined) {
    result.hp =
      numbers.hp + (baseStats.hp * delta('hpPercent')) / 100 + delta('flatHp');
  }
  if (numbers.def !== undefined) {
    result.def =
      numbers.def +
      (baseStats.def * delta('defPercent')) / 100 +
      delta('flatDef');
  }
  return result;
};

// The totals as the character screen lists them, for display.
export const formatScreenTotals = (
  character: CharacterData,
  totals: ScreenTotals
): { label: string; value: string }[] => [
  // Whole numbers, as the game shows them.
  { label: 'ATK', value: formatNumber(Math.round(totals.atk)) },
  { label: 'Max HP', value: formatNumber(Math.round(totals.hp)) },
  { label: 'DEF', value: formatNumber(Math.round(totals.def)) },
  { label: 'Elemental Mastery', value: formatNumber(Math.round(totals.em)) },
  { label: 'CRIT Rate', value: `${formatNumber(totals.cr)}%` },
  { label: 'CRIT DMG', value: `${formatNumber(totals.cd)}%` },
  {
    label: 'Energy Recharge',
    value: `${formatNumber(totals.energyRecharge)}%`,
  },
  {
    label: `${character.element} DMG Bonus`,
    value: `${formatNumber(totals.elementalBonus)}%`,
  },
];
