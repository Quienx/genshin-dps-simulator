import { DAMAGE_ELEMENTS } from './characterSchema';
import { getResistanceFieldName } from './enemyDummy';
import { getReactionMultiplier, getTransformativeReaction } from './reactions';
import { readNumber } from './readValue';
import {
  CritMode,
  DamageContext,
  DamageElement,
  HighestHit,
  HitInput,
  HitLogEntry,
  HitOrigin,
  ParsedValues,
} from './types';

export const CHARACTER_LEVEL = 90;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const defenseMultiplier = (
  characterLevel: number,
  enemyLevel: number,
  defenseReduction = 0,
  defenseIgnore = 0
): number =>
  (characterLevel + 100) /
  (characterLevel +
    100 +
    (enemyLevel + 100) * (1 - defenseReduction) * (1 - defenseIgnore));

export const resistanceMultiplier = (resistancePercent: number): number => {
  const resistance = resistancePercent / 100;
  if (resistance < 0) {
    return 1 - resistance / 2;
  }
  if (resistance < 0.75) {
    return 1 - resistance;
  }
  return 1 / (4 * resistance + 1);
};

// Extra reduction and ignore (fractions) come from the hit's bonuses.
export const getEnemyDefenseMultiplier = (
  values: ParsedValues,
  extraReduction = 0,
  defenseIgnore = 0
): number =>
  defenseMultiplier(
    CHARACTER_LEVEL,
    Math.max(1, readNumber(values, 'enemyLevel')),
    clamp(readNumber(values, 'enemyDefReduction') / 100 + extraReduction, 0, 1),
    clamp(defenseIgnore, 0, 1)
  );

// `shred` is in RES points, taken off the enemy's own value.
export const getEnemyResistanceMultiplier = (
  values: ParsedValues,
  element: DamageElement,
  shred = 0
): number =>
  resistanceMultiplier(
    clamp(
      clamp(readNumber(values, getResistanceFieldName(element)), -100, 100) -
        shred,
      -100,
      100
    )
  );

const buildResistanceMultipliers = (
  values: ParsedValues
): Record<DamageElement, number> =>
  Object.fromEntries(
    DAMAGE_ELEMENTS.map((element) => [
      element,
      getEnemyResistanceMultiplier(values, element),
    ])
  ) as Record<DamageElement, number>;

export const createDamageContext = (
  values: ParsedValues,
  critMode: CritMode = 'random'
): DamageContext => ({
  values,
  critMode,
  defense: getEnemyDefenseMultiplier(values),
  resistanceByElement: buildResistanceMultipliers(values),
  totalDamage: 0,
  totalHits: 0,
  totalCrits: 0,
  damageByCategory: {},
  critsByCategory: {},
  highestHit: null,
  hitLog: [],
  cumulativeDamage: 0,
});

const getElementDamageBonus = (
  values: ParsedValues,
  element: DamageElement
): number => {
  if (element === 'Physical') {
    return readNumber(values, 'physicalBonus');
  }
  return readNumber(values, 'elementalBonus');
};

type EnemyDebuffs = {
  defReduction: number;
  defIgnore: number;
  resShred: number;
};

// The run-wide multipliers unless the hit carries its own debuffs: DEF and
// RES on their own (each hit keeps them, for its breakdown).
const getEnemyMultipliers = (
  context: DamageContext,
  element: DamageElement,
  { defReduction, defIgnore, resShred }: EnemyDebuffs
): { defense: number; resistance: number } => {
  const defense =
    defReduction === 0 && defIgnore === 0
      ? context.defense
      : getEnemyDefenseMultiplier(context.values, defReduction, defIgnore);
  const resistance =
    resShred === 0
      ? context.resistanceByElement[element]
      : getEnemyResistanceMultiplier(context.values, element, resShred);
  return { defense, resistance };
};

const getCritMultiplier = (isCrit: boolean, critDamage: number): number => {
  if (!isCrit) {
    return 1;
  }
  return 1 + critDamage;
};

const rollCrit = (critMode: CritMode, critRate: number): boolean => {
  if (critMode === 'expected') {
    return false;
  }
  return Math.random() < critRate;
};

const getAppliedCritMultiplier = (
  critMode: CritMode,
  isCrit: boolean,
  critRate: number,
  critDamage: number
): number => {
  if (critMode === 'expected') {
    return 1 + critRate * critDamage;
  }
  return getCritMultiplier(isCrit, critDamage);
};

const isNewHighestHit = (
  highestHit: HighestHit | null,
  damage: number
): boolean => {
  if (!highestHit) {
    return true;
  }
  return damage > highestHit.damage;
};

const registerCrit = (context: DamageContext, category: string) => {
  context.totalCrits++;
  context.critsByCategory[category] =
    (context.critsByCategory[category] ?? 0) + 1;
};

export const addHit = (
  context: DamageContext,
  {
    time = 0,
    category,
    element,
    stat,
    multiplier,
    flatDamage = 0,
    extraBonus = 0,
    extraCrit = 0,
    extraCritDamage = 0,
    extraEm = 0,
    defReduction = 0,
    defIgnore = 0,
    resShred = 0,
    stacks = null,
    reaction = 'None',
    reactionMultiplier = getReactionMultiplier(
      context.values,
      reaction,
      element,
      extraEm
    ),
    notes = '',
    actionId,
    sourceId,
    effectIds,
    blockUid,
  }: HitInput
) => {
  const { values } = context;

  const globalBonus =
    (Math.max(-100, readNumber(values, 'bonus')) +
      Math.max(-100, getElementDamageBonus(values, element))) /
    100;

  const totalBonus = globalBonus + extraBonus;
  const baseDamage =
    Math.max(0, (stat * multiplier) / 100 + flatDamage) *
    Math.max(0, 1 + totalBonus);

  const critRate = clamp(readNumber(values, 'cr') / 100 + extraCrit, 0, 1);
  const critDamage = Math.max(
    0,
    readNumber(values, 'cd') / 100 + extraCritDamage
  );
  const isCrit = rollCrit(context.critMode, critRate);

  const { defense, resistance } = getEnemyMultipliers(context, element, {
    defReduction,
    defIgnore,
    resShred,
  });
  const enemyMultiplier = defense * resistance;
  const validReactionMultiplier = Math.max(0, reactionMultiplier);
  const critMultiplier = getAppliedCritMultiplier(
    context.critMode,
    isCrit,
    critRate,
    critDamage
  );
  const damage =
    baseDamage * critMultiplier * enemyMultiplier * validReactionMultiplier;

  const maxDamage =
    baseDamage * (1 + critDamage) * enemyMultiplier * validReactionMultiplier;

  recordHit(context, {
    time,
    category,
    element,
    multiplier,
    stacks,
    baseDamage,
    totalBonus: totalBonus * 100,
    extraBonus: extraBonus * 100,
    critRate,
    critDamage,
    extraCrit: extraCrit * 100,
    isCrit,
    stat,
    reaction,
    reactionMultiplier: validReactionMultiplier,
    flatDamage,
    critMultiplier,
    defMultiplier: defense,
    resMultiplier: resistance,
    notes,
    damage,
    maxDamage,
    actionId,
    sourceId,
    effectIds,
    blockUid,
  });
};

// Adds a dealt hit to the run's totals and its log.
const recordHit = (
  context: DamageContext,
  entry: Omit<HitLogEntry, 'index' | 'cumulativeDamage'>
) => {
  const { category, damage, maxDamage, isCrit } = entry;
  context.totalDamage += damage;
  context.cumulativeDamage += damage;
  context.totalHits++;

  context.damageByCategory[category] =
    (context.damageByCategory[category] ?? 0) + damage;

  if (isCrit) {
    registerCrit(context, category);
  }

  if (isNewHighestHit(context.highestHit, damage)) {
    context.highestHit = { category, damage, maxDamage, isCrit };
  }

  context.hitLog.push({
    ...entry,
    index: context.totalHits,
    cumulativeDamage: context.cumulativeDamage,
  });
};

// A transformative reaction's hit (Overloaded): its own base DMG, reduced
// only by the enemy's RES to its element. It never CRITs.
export const addTransformativeHit = (
  context: DamageContext,
  {
    time = 0,
    reaction,
    extraEm = 0,
    resShred = 0,
    notes = '',
    actionId,
    sourceId,
    effectIds,
    blockUid,
  }: {
    time?: number;
    reaction: string;
    extraEm?: number;
    resShred?: number;
    notes?: string;
  } & HitOrigin
) => {
  const { element, baseDamage } = getTransformativeReaction(
    context.values,
    reaction,
    extraEm
  );
  const resistance =
    resShred === 0
      ? context.resistanceByElement[element]
      : getEnemyResistanceMultiplier(context.values, element, resShred);
  const damage = baseDamage * resistance;
  recordHit(context, {
    time,
    category: reaction,
    element,
    multiplier: 0,
    stacks: null,
    baseDamage,
    totalBonus: 0,
    extraBonus: 0,
    critRate: 0,
    extraCrit: 0,
    isCrit: false,
    reaction,
    reactionMultiplier: 1,
    critMultiplier: 1,
    defMultiplier: 1,
    resMultiplier: resistance,
    notes,
    damage,
    maxDamage: damage,
    actionId,
    sourceId,
    effectIds,
    blockUid,
  });
};
