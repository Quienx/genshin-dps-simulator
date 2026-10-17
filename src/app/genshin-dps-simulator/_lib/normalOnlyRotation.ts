import { CHARACTER_ACTIONS, getCharacterData } from './characterData';
import {
  addHit,
  createDamageContext,
  getEnemyDefenseMultiplier,
  getEnemyResistanceMultiplier,
} from './damageEngine';
import { getBuildEffects, sumHitBonuses } from './effects';
import formatNumber from './formatNumber';
import { FRAMES_PER_SECOND } from './frames';
import { readFlag, readNumber } from './readValue';
import { getRowMultiplier } from './talents';
import { DamageContext, FieldDefinition, KitRow, ParsedValues } from './types';

// Arlecchino's "Normal Attacks only" comparison: everything it needs comes
// from her file (combo timing, the weapon's Bond of Life grant, the set).
const ARLECCHINO = getCharacterData('arlecchino');
const ACTIONS = CHARACTER_ACTIONS.arlecchino;
const BUILD_EFFECTS = getBuildEffects(ARLECCHINO);

const requireValue = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw new Error(`Arlecchino's data is missing ${what}`);
  }
  return value;
};

const findBlock = (blocks: { id: string }[], id: string) =>
  requireValue(
    blocks.find((block) => block.id === id),
    `the "${id}" block`
  );

const bondGrant = findBlock(
  ARLECCHINO.weapon.blocks,
  'crimson-moon-bond-grant'
);
const CHARGED_ATTACK_BOND = requireValue(
  'do' in bondGrant
    ? (bondGrant.do as { amount?: unknown }[])
        .map((op) => op.amount)
        .find((amount): amount is number => typeof amount === 'number')
    : undefined,
  "the weapon's Bond of Life grant"
);
const whimsyStatus = findBlock(ARLECCHINO.artifactSet.blocks, 'whimsy');
const WHIMSY_SECONDS =
  requireValue(
    'stacks' in whimsyStatus
      ? (whimsyStatus.stacks as { durationFrames: number } | undefined)
          ?.durationFrames
      : undefined,
    'the set stack duration'
  ) / FRAMES_PER_SECOND;
const whimsyBonus = findBlock(
  ARLECCHINO.artifactSet.blocks,
  'harmonic-whimsy-4pc'
);
const WHIMSY_STACK_BONUS =
  'value' in whimsyBonus ? Number(whimsyBonus.value) : 0;

const chargedAction = requireValue(ACTIONS.charged, 'the Charged Attack');
const CHARGED_ATTACK_FRAMES = {
  hitmark: requireValue(chargedAction.hits?.[0]?.frame, 'the Charged hit'),
  end: requireValue(chargedAction.end, 'the Charged end'),
};

const framesToSeconds = (frames: number): number => frames / FRAMES_PER_SECOND;

type ComboHitTiming = {
  comboIndex: number;
  frameInCombo: number;
  row: string;
};

type ScheduledComboHit = {
  time: number;
  comboIndex: number;
  row: string;
};

// Every hit of one full combo, timed from the combo's start.
const COMBO_HIT_TIMINGS: ComboHitTiming[] = (() => {
  const timings: ComboHitTiming[] = [];
  let attackStart = 0;
  for (const step of ACTIONS.normal?.combo ?? []) {
    step.hits.forEach((hit) => {
      timings.push({
        comboIndex: timings.length,
        frameInCombo: attackStart + hit.frame,
        row: hit.row,
      });
    });
    attackStart += step.end;
  }
  return timings;
})();

const COMBO_FRAMES = (ACTIONS.normal?.combo ?? []).reduce(
  (total, step) => total + step.end,
  0
);

const scheduleComboHits = (
  startTime: number,
  endTime: number
): ScheduledComboHit[] => {
  const hits: ScheduledComboHit[] = [];
  const comboSeconds = framesToSeconds(COMBO_FRAMES);
  for (
    let comboStart = startTime;
    comboStart < endTime;
    comboStart += comboSeconds
  ) {
    for (const timing of COMBO_HIT_TIMINGS) {
      const time = comboStart + framesToSeconds(timing.frameInCombo);
      if (time >= endTime) {
        return hits;
      }
      hits.push({ time, comboIndex: timing.comboIndex, row: timing.row });
    }
  }
  return hits;
};

const COMBO_LABELS = [
  '1st hit',
  '2nd hit',
  '3rd hit',
  '4th hit (1/2)',
  '4th hit (2/2)',
  '5th hit',
  '6th hit',
];

export const NORMAL_ONLY_FIELDS: FieldDefinition[] = [
  {
    kind: 'checkbox',
    section: 'normalOnly',
    name: 'normalOnlyChargedBond',
    label: 'Open with a Charged Attack to gain 25% Bond of Life (weapon)',
  },
];

export type NormalComboHit = {
  id: string;
  label: string;
  hitSecond: number;
  multiplier: number;
  nonCrit: number;
  crit: number;
  average: number;
};

export type NormalOnlyRotation = {
  comboHits: NormalComboHit[];
  comboAverage: number;
  comboSeconds: number;
  hitCount: number;
  rotationSeconds: number;
  totalAverage: number;
  totalNonCrit: number;
  totalCrit: number;
  averageDps: number;
  bonusRows: KitRow[];
};

type HitScaling = {
  atk: number;
  baseBonus: number;
  enemyMultiplier: number;
  critRate: number;
  critDamage: number;
};

// The Bond of Life comes from Crimson Moon's Semblance, so without the weapon
// the opening Charged Attack grants none.
const getChargedAttackBond = (values: ParsedValues): number => {
  if (!readFlag(values, 'normalOnlyChargedBond')) {
    return 0;
  }
  if (!readFlag(values, ARLECCHINO.weapon.enabledFlag)) {
    return 0;
  }
  return CHARGED_ATTACK_BOND;
};

// The Charged Attack's Bond of Life gain is the only Bond change in this
// rotation, so the 4-piece holds a single stack for its duration.
const getWhimsyStacksAt = (values: ParsedValues, time: number): number => {
  if (getChargedAttackBond(values) <= 0) {
    return 0;
  }
  const secondsSinceChargedHit =
    time - framesToSeconds(CHARGED_ATTACK_FRAMES.hitmark);
  return Number(secondsSinceChargedHit < WHIMSY_SECONDS);
};

const getNormalOnlyBonuses = (values: ParsedValues, whimsyStacks: number) =>
  sumHitBonuses(BUILD_EFFECTS, {
    values,
    element: 'Physical',
    category: 'Normal',
    state: { bondOfLife: getChargedAttackBond(values), whimsy: whimsyStacks },
  });

const getComboMultiplier = (values: ParsedValues, row: string): number =>
  getRowMultiplier(ARLECCHINO, row, values);

const getNormalStartTime = (values: ParsedValues): number => {
  if (!readFlag(values, 'normalOnlyChargedBond')) {
    return 0;
  }
  return framesToSeconds(CHARGED_ATTACK_FRAMES.end);
};

const computeHit = (
  scaling: HitScaling,
  multiplier: number,
  extraBonus: number
) => {
  const nonCrit =
    ((scaling.atk * multiplier) / 100) *
    Math.max(0, 1 + scaling.baseBonus + extraBonus) *
    scaling.enemyMultiplier;
  return {
    nonCrit,
    crit: nonCrit * (1 + scaling.critDamage),
    average: nonCrit * (1 + scaling.critRate * scaling.critDamage),
  };
};

const toComboHit = (
  values: ParsedValues,
  scaling: HitScaling,
  weaponBonus: number,
  timing: ComboHitTiming
): NormalComboHit => {
  const multiplier = getComboMultiplier(values, timing.row);
  return {
    id: `normal-${timing.comboIndex + 1}`,
    label: COMBO_LABELS[timing.comboIndex] ?? `Hit ${timing.comboIndex + 1}`,
    hitSecond: framesToSeconds(timing.frameInCombo),
    multiplier,
    ...computeHit(scaling, multiplier, weaponBonus),
  };
};

const getWeaponStatus = (weaponBonus: number): KitRow['status'] => {
  if (weaponBonus <= 0) {
    return 'disabled';
  }
  return 'applied';
};

const buildBonusRows = (weaponBonus: number): KitRow[] => [
  {
    id: 'normal-only-masque',
    label: 'Masque of the Red Death',
    value: 'Inactive: without the E, Bond of Life never reaches 30%',
    status: 'disabled',
  },
  {
    id: 'normal-only-element',
    label: 'Hit element',
    value: 'Physical: the Pyro DMG Bonus and the +40% passive do not apply',
    status: 'disabled',
  },
  {
    id: 'normal-only-weapon',
    label: 'Weapon at 25% Bond of Life',
    value: `+${formatNumber(
      weaponBonus * 100
    )}% DMG (does not reach the ≥ 30% tier)`,
    status: getWeaponStatus(weaponBonus),
  },
  {
    id: 'normal-only-set',
    label: 'Set 4-piece',
    value: `Only 1 stack (+${WHIMSY_STACK_BONUS}%) for the first ${WHIMSY_SECONDS} s after the Charged Attack`,
    note: 'Without Masque no Bond of Life is consumed, so no further stacks are gained.',
  },
];

export const computeNormalOnlyRotation = (
  values: ParsedValues
): NormalOnlyRotation => {
  const rotationSeconds = Math.max(1, readNumber(values, 'duration'));
  const scheduledHits = scheduleComboHits(
    getNormalStartTime(values),
    rotationSeconds
  );

  const defense = getEnemyDefenseMultiplier(values);
  const resistance = getEnemyResistanceMultiplier(values, 'Physical');

  const scaling: HitScaling = {
    atk: Math.max(0, readNumber(values, 'atk')),
    baseBonus:
      (Math.max(-100, readNumber(values, 'bonus')) +
        Math.max(-100, readNumber(values, 'physicalBonus'))) /
      100,
    enemyMultiplier: defense * resistance,
    critRate: Math.min(1, Math.max(0, readNumber(values, 'cr') / 100)),
    critDamage: Math.max(0, readNumber(values, 'cd')) / 100,
  };

  const weaponBonus = getNormalOnlyBonuses(values, 0).dmgBonus;
  const comboHits = COMBO_HIT_TIMINGS.map((timing) =>
    toComboHit(values, scaling, weaponBonus, timing)
  );

  let totalAverage = 0;
  let totalNonCrit = 0;
  let totalCrit = 0;
  for (const scheduledHit of scheduledHits) {
    const hit = computeHit(
      scaling,
      getComboMultiplier(values, scheduledHit.row),
      getNormalOnlyBonuses(values, getWhimsyStacksAt(values, scheduledHit.time))
        .dmgBonus
    );
    totalAverage += hit.average;
    totalNonCrit += hit.nonCrit;
    totalCrit += hit.crit;
  }

  return {
    comboHits,
    comboAverage: comboHits.reduce((sum, hit) => sum + hit.average, 0),
    comboSeconds: framesToSeconds(COMBO_FRAMES),
    hitCount: scheduledHits.length,
    rotationSeconds,
    totalAverage,
    totalNonCrit,
    totalCrit,
    averageDps: totalAverage / rotationSeconds,
    bonusRows: buildBonusRows(weaponBonus),
  };
};

export const simulateNormalOnlyRotation = (
  values: ParsedValues
): DamageContext => {
  const context = createDamageContext(values);
  const stat = Math.max(0, readNumber(values, 'atk'));
  const scheduledHits = scheduleComboHits(
    getNormalStartTime(values),
    Math.max(1, readNumber(values, 'duration'))
  );

  for (const scheduledHit of scheduledHits) {
    const bonuses = getNormalOnlyBonuses(
      values,
      getWhimsyStacksAt(values, scheduledHit.time)
    );
    addHit(context, {
      time: scheduledHit.time,
      category:
        COMBO_LABELS[scheduledHit.comboIndex] ??
        `Hit ${scheduledHit.comboIndex + 1}`,
      element: 'Physical',
      stat,
      multiplier: getComboMultiplier(values, scheduledHit.row),
      extraBonus: bonuses.dmgBonus,
      notes: ['Physical, no Masque', ...bonuses.notes].join('; '),
    });
  }

  return context;
};
