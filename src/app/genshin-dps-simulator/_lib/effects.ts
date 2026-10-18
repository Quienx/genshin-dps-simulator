import {
  Block,
  BonusBlock,
  BonusStat,
  OfStat,
  SheetStat,
} from './engine/schema';
import formatNumber from './formatNumber';
import { readFlag, readNumber } from './readValue';
import { StatSheet } from './stats';
import { ParsedValues } from './types';

type StateCondition = { gt?: number; gte?: number; lt?: number; lte?: number };

// A bonus in the shape the hit math works with.
export type EffectData = {
  id: string;
  label: string;
  stat: StatBonusBlock['stat'];
  value: StatBonusBlock['value'];
  // A field's value picks it; a party element count is resolved by the
  // runtime before (the party never changes in a run).
  scaleBy?: { field: string };
  perStack?: BonusBlock['perStack'];
  ofStat?: BonusBlock['ofStat'];
  cap?: number;
  // Left out of the stats other buffs convert (gcsim's "Extra").
  extra?: boolean;
  when?: {
    flag?: string;
    elements?: string[];
    categories?: string[];
    state?: Record<string, StateCondition>;
  };
};

export const toEffect = (block: StatBonusBlock): EffectData => ({
  id: block.id,
  label: block.label,
  stat: block.stat,
  value: block.value,
  scaleBy:
    block.scaleBy && 'field' in block.scaleBy ? block.scaleBy : undefined,
  perStack: block.perStack,
  ofStat: block.ofStat,
  cap: block.cap,
  extra: block.extra,
  when: {
    flag: block.ifFlag,
    elements: block.match?.elements,
    categories: block.match?.categories,
    state: block.while,
  },
});

type StatBonusBlock = BonusBlock & {
  stat: NonNullable<BonusBlock['stat']>;
  value: NonNullable<BonusBlock['value']>;
};

// Stat bonuses (DMG%, CRIT, flat multiplier); infusions and extra
// multipliers are applied by the engine before the hit math.
export const isStatBonus = (block: Block): block is StatBonusBlock =>
  block.type === 'bonus' &&
  block.stat !== undefined &&
  block.value !== undefined;

export type HitConditions = {
  values: ParsedValues;
  element: string;
  category: string;
  state?: Record<string, number>;
  // Needed as soon as a bonus touches ATK, HP, DEF or EM.
  sheet?: StatSheet;
};

export type HitBonuses = {
  dmgBonus: number;
  critRate: number;
  critDamage: number;
  flatMultiplier: number;
  // Added to the hit's base DMG.
  flatDamage: number;
  // EM on top of the sheet's.
  elementalMastery: number;
  // Fractions of the enemy's DEF.
  defReduction: number;
  defIgnore: number;
  // RES points.
  resShred: number;
  // Fractions: Lunar DMG bonus, Lunar Base DMG bonus, Elevation, and the
  // talent multiplier's increase.
  lunarBonus: number;
  lunarBaseBonus: number;
  elevation: number;
  multiplierBonus: number;
  // Stat totals with every bonus (the sheet's when no sheet was given).
  stats: Record<SheetStat, number>;
  activeEffectIds: string[];
  notes: string[];
};

const meetsStateCondition = (
  current: number,
  condition: StateCondition
): boolean => {
  if (condition.gt !== undefined && !(current > condition.gt)) {
    return false;
  }
  if (condition.gte !== undefined && !(current >= condition.gte)) {
    return false;
  }
  if (condition.lt !== undefined && !(current < condition.lt)) {
    return false;
  }
  if (condition.lte !== undefined && !(current <= condition.lte)) {
    return false;
  }
  return true;
};

const matchesList = (list: string[] | undefined, value: string): boolean => {
  if (!list) {
    return true;
  }
  return list.includes(value);
};

const isEffectActive = (effect: EffectData, hit: HitConditions): boolean => {
  const when = effect.when ?? {};
  if (when.flag && !readFlag(hit.values, when.flag)) {
    return false;
  }
  if (!matchesList(when.elements, hit.element)) {
    return false;
  }
  if (!matchesList(when.categories, hit.category)) {
    return false;
  }
  return Object.entries(when.state ?? {}).every(([key, condition]) =>
    meetsStateCondition(hit.state?.[key] ?? 0, condition)
  );
};

export const getEffectValue = (
  effect: EffectData,
  values: ParsedValues
): number => {
  if (typeof effect.value === 'number') {
    return effect.value;
  }
  const field = effect.scaleBy?.field;
  const rank = field ? readNumber(values, field) : 1;
  const index =
    Math.min(effect.value.length, Math.max(1, Math.floor(rank))) - 1;
  return effect.value[index];
};

// A bonus's stacks: the product of every `perStack` factor, each capped.
export const countStacks = (
  perStack: NonNullable<BonusBlock['perStack']>,
  state: Record<string, number> | undefined
): number =>
  perStack.reduce(
    (product, { state: id, max }) =>
      product * Math.min(max, Math.max(0, state?.[id] ?? 0)),
    1
  );

// The most stacks a bonus can have.
export const maxStacks = (perStack: BonusBlock['perStack']): number =>
  (perStack ?? []).reduce((product, { max }) => product * max, 1);

const getStacks = (
  effect: EffectData,
  state: Record<string, number> | undefined
): number => (effect.perStack ? countStacks(effect.perStack, state) : 1);

type ActiveEffect = {
  effect: EffectData;
  stacks: number;
  total: number;
};

const toActiveEffect = (
  effect: EffectData,
  hit: HitConditions
): ActiveEffect => {
  const stacks = getStacks(effect, hit.state);
  return { effect, stacks, total: getEffectValue(effect, hit.values) * stacks };
};

const formatStacks = (active: ActiveEffect): string => {
  if (!active.effect.perStack) {
    return '';
  }
  return ` ${active.stacks} stacks`;
};

const FLAT_STATS: BonusStat[] = [
  'flatAtk',
  'flatHp',
  'flatDef',
  'elementalMastery',
  'flatDamage',
];

const STAT_NOTE_LABELS: Partial<Record<BonusStat, string>> = {
  atkPercent: 'ATK',
  hpPercent: 'HP',
  defPercent: 'DEF',
  flatAtk: 'ATK',
  flatHp: 'HP',
  flatDef: 'DEF',
  elementalMastery: 'EM',
  flatDamage: 'DMG',
  defReduction: 'DEF reduction',
  defIgnore: 'DEF ignored',
  resShred: 'RES shred',
  lunarBonus: 'Lunar DMG',
  lunarBaseBonus: 'Lunar Base DMG',
  elevation: 'Elevation',
  multiplierBonus: 'multiplier',
};

const formatSigned = (value: number, stat: BonusStat): string => {
  const sign = value < 0 ? '-' : '+';
  const unit = FLAT_STATS.includes(stat) ? '' : '%';
  return `${sign}${formatNumber(Math.abs(value))}${unit}`;
};

// Effects that share a label are reported once with their combined value, so
// both Crimson Moon tiers read as a single "Crimson Moon's Semblance +36%"
// note.
const buildNotes = (actives: ActiveEffect[]): string[] => {
  const byLabel = new Map<string, ActiveEffect[]>();
  actives.forEach((active) => {
    byLabel.set(active.effect.label, [
      ...(byLabel.get(active.effect.label) ?? []),
      active,
    ]);
  });
  return Array.from(byLabel.entries()).map(([label, group]) => {
    const total = group.reduce((sum, active) => sum + active.total, 0);
    const { stat } = group[0].effect;
    const statLabel = STAT_NOTE_LABELS[stat];
    return [
      `${label}${formatStacks(group[0])}`,
      formatSigned(total, stat),
      statLabel,
    ]
      .filter(Boolean)
      .join(' ');
  });
};

const sumStat = (actives: ActiveEffect[], stat: EffectData['stat']): number =>
  actives
    .filter((active) => active.effect.stat === stat)
    .reduce((sum, active) => sum + active.total, 0);

const SHEET_BONUS_STATS: BonusStat[] = [
  'atkPercent',
  'hpPercent',
  'defPercent',
  'flatAtk',
  'flatHp',
  'flatDef',
  'elementalMastery',
];

const EMPTY_SHEET: StatSheet = {
  base: { atk: 0, hp: 0, def: 0 },
  total: { atk: 0, hp: 0, def: 0, em: 0 },
};

const getStatTotals = (
  actives: ActiveEffect[],
  sheet: StatSheet
): Record<OfStat, number> => ({
  baseAtk: sheet.base.atk,
  atk:
    sheet.total.atk +
    (sheet.base.atk * sumStat(actives, 'atkPercent')) / 100 +
    sumStat(actives, 'flatAtk'),
  hp:
    sheet.total.hp +
    (sheet.base.hp * sumStat(actives, 'hpPercent')) / 100 +
    sumStat(actives, 'flatHp'),
  def:
    sheet.total.def +
    (sheet.base.def * sumStat(actives, 'defPercent')) / 100 +
    sumStat(actives, 'flatDef'),
  em: sheet.total.em + sumStat(actives, 'elementalMastery'),
});

// A bonus never goes past its `cap` (C4's "up to 20,000 DMG").
const applyCap = (active: ActiveEffect): ActiveEffect =>
  active.effect.cap === undefined || active.total <= active.effect.cap
    ? active
    : { ...active, total: active.effect.cap };

export const sumHitBonuses = (
  effects: EffectData[],
  hit: HitConditions
): HitBonuses => {
  const matched = effects
    .filter((effect) => isEffectActive(effect, hit))
    .map((effect) => toActiveEffect(effect, hit));

  const needsSheet = matched.find(
    (active) =>
      active.effect.ofStat !== undefined ||
      SHEET_BONUS_STATS.includes(active.effect.stat)
  );
  if (needsSheet && !hit.sheet) {
    throw new Error(`Bonus "${needsSheet.effect.id}" needs the stat sheet`);
  }
  const sheet = hit.sheet ?? EMPTY_SHEET;

  // Conversions ("% of DEF") read the totals of every other bonus, so they
  // never feed each other.
  const direct = matched
    .filter((active) => !active.effect.ofStat)
    .map(applyCap);
  const directTotals = getStatTotals(direct, sheet);
  const converted = matched
    .filter((active) => active.effect.ofStat)
    .map((active) =>
      applyCap({
        ...active,
        total:
          (active.total * directTotals[active.effect.ofStat as OfStat]) / 100,
      })
    );
  const actives = [...direct, ...converted].filter(
    (active) => active.total !== 0
  );

  return {
    dmgBonus: sumStat(actives, 'dmgBonus') / 100,
    critRate: sumStat(actives, 'critRate') / 100,
    critDamage: sumStat(actives, 'critDamage') / 100,
    flatMultiplier: sumStat(actives, 'flatMultiplier'),
    flatDamage: sumStat(actives, 'flatDamage'),
    elementalMastery: sumStat(actives, 'elementalMastery'),
    defReduction: sumStat(actives, 'defReduction') / 100,
    defIgnore: sumStat(actives, 'defIgnore') / 100,
    resShred: sumStat(actives, 'resShred'),
    lunarBonus: sumStat(actives, 'lunarBonus') / 100,
    lunarBaseBonus: sumStat(actives, 'lunarBaseBonus') / 100,
    elevation: sumStat(actives, 'elevation') / 100,
    multiplierBonus: sumStat(actives, 'multiplierBonus') / 100,
    stats: getStatTotals(actives, sheet),
    activeEffectIds: actives.map((active) => active.effect.id),
    notes: buildNotes(actives),
  };
};

// What a bonus gives while it is up: a team buff's value, from the giver's
// screen totals (`ofStat`) and stacks (every stack when `state` is not
// given, for the details).
export const getEffectTotal = (
  effect: EffectData,
  values: ParsedValues,
  sheet: StatSheet,
  state?: Record<string, number>
): number => {
  const stacks = state ? getStacks(effect, state) : maxStacks(effect.perStack);
  const total = getEffectValue(effect, values) * stacks;
  const converted = effect.ofStat
    ? (total * getStatTotals([], sheet)[effect.ofStat]) / 100
    : total;
  return applyCap({ effect, stacks, total: converted }).total;
};

// Highest DMG Bonus the build can reach: only toggles are checked; every
// state condition is assumed met and every stack maxed. Bonuses that scale
// with a stat (`ofStat`) need the run's sheet, so they are left out.
export const getMaxDamageBonus = (
  effects: EffectData[],
  values: ParsedValues
): number =>
  effects
    .filter((effect) => effect.stat === 'dmgBonus' && !effect.ofStat)
    .filter(
      (effect) => !effect.when?.flag || readFlag(values, effect.when.flag)
    )
    .reduce(
      (sum, effect) =>
        sum + getEffectValue(effect, values) * maxStacks(effect.perStack),
      0
    );

type BuildWithBlocks = {
  blocks: Block[];
  artifactSet: { blocks: Block[] };
  weapon: { blocks: Block[] };
};

// Every bonus of the build: the character's own, then the set's, then the
// weapon's (this order keeps each stat summed in the same order as before).
// Team buffs are for the rest of the party, so they are not part of it.
export const getBuildEffects = (build: BuildWithBlocks): EffectData[] =>
  [...build.blocks, ...build.artifactSet.blocks, ...build.weapon.blocks]
    .filter(isStatBonus)
    .filter((block) => !block.teamBuff || block.teamBuff === 'everyone')
    .map(toEffect);
