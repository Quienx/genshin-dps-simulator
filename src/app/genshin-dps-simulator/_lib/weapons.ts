import { WeaponData, WeaponRowData } from './characterSchema';
import { getEffectValue, isStatBonus, toEffect } from './effects';
import formatNumber from './formatNumber';
import { readFlag, readNumber } from './readValue';
import { FieldDefinition, KitRow, KitStatus, ParsedValues } from './types';

const MAX_REFINEMENT = 5;

const SUBSTAT_LABELS: Record<WeaponData['substat']['stat'], string> = {
  critRate: 'CRIT Rate',
  critDamage: 'CRIT DMG',
  atkPercent: 'ATK',
  hpPercent: 'HP',
  energyRecharge: 'Energy Recharge',
  elementalMastery: 'Elemental Mastery',
  physicalDmg: 'Physical DMG Bonus',
};

const SUBSTAT_ROW_IDS: Record<WeaponData['substat']['stat'], string> = {
  critRate: 'weapon-crit-rate',
  critDamage: 'weapon-crit-damage',
  atkPercent: 'weapon-atk',
  hpPercent: 'weapon-hp',
  energyRecharge: 'weapon-energy-recharge',
  elementalMastery: 'weapon-elemental-mastery',
  physicalDmg: 'weapon-physical-dmg',
};

const formatSubstatValue = (
  stat: WeaponData['substat']['stat'],
  value: number
): string => {
  if (stat === 'elementalMastery') {
    return formatNumber(value);
  }
  return `${formatNumber(value)}%`;
};

export const clampRefinement = (refinement: number): number =>
  Math.min(MAX_REFINEMENT, Math.max(1, Math.floor(refinement)));

export const getWeaponRefinement = (
  weapon: WeaponData,
  values: ParsedValues
): number => clampRefinement(readNumber(values, weapon.refinementField));

export const isWeaponEquipped = (
  weapon: WeaponData,
  values: ParsedValues
): boolean => readFlag(values, weapon.enabledFlag);

export const getWeaponMechanic = (weapon: WeaponData, key: string): number => {
  const value = weapon.mechanics[key];
  if (value === undefined) {
    throw new Error(`${weapon.name} has no mechanic "${key}"`);
  }
  return value;
};

export const getWeaponFields = (weapon: WeaponData): FieldDefinition[] => [
  {
    kind: 'checkbox',
    section: 'weapon',
    name: weapon.enabledFlag,
    label: `Weapon: ${weapon.name}`,
  },
  {
    kind: 'number',
    section: 'weapon',
    name: weapon.refinementField,
    label: `Weapon refinement (R1-R${MAX_REFINEMENT})`,
    min: 1,
    max: MAX_REFINEMENT,
    step: 1,
  },
];

export const getWeaponSubtitle = (
  weapon: WeaponData,
  values: ParsedValues
): string =>
  `R${getWeaponRefinement(weapon, values)} · ${weapon.rarity}★ ${
    weapon.type
  } · Lv. ${weapon.level}`;

const findEffect = (weapon: WeaponData, effectId: string) => {
  const block = weapon.blocks
    .filter(isStatBonus)
    .find((entry) => entry.id === effectId);
  if (!block) {
    throw new Error(`${weapon.name} has no bonus "${effectId}"`);
  }
  return toEffect(block);
};

const resolveEffectToken = (
  weapon: WeaponData,
  values: ParsedValues,
  reference: string
): number =>
  reference
    .split('+')
    .reduce(
      (total, effectId) =>
        total + getEffectValue(findEffect(weapon, effectId), values),
      0
    );

const resolveParamToken = (
  row: WeaponRowData,
  refinement: number,
  name: string
): number => {
  const perRefinement = row.params?.[name];
  if (!perRefinement) {
    throw new Error(`Weapon row "${row.id}" has no param "${name}"`);
  }
  return perRefinement[Math.min(perRefinement.length, refinement) - 1];
};

const resolveToken = (
  weapon: WeaponData,
  row: WeaponRowData,
  values: ParsedValues,
  token: string
): string => {
  const [kind, reference = ''] = token.split(':');
  const refinement = getWeaponRefinement(weapon, values);
  switch (kind) {
    case 'refinement':
      return String(refinement);
    case 'effect':
      return formatNumber(resolveEffectToken(weapon, values, reference));
    case 'param':
      return formatNumber(resolveParamToken(row, refinement, reference));
    case 'mechanic':
      return formatNumber(getWeaponMechanic(weapon, reference));
    default:
      throw new Error(`Unknown weapon template token "{${token}}"`);
  }
};

const fillTemplate = (
  weapon: WeaponData,
  row: WeaponRowData,
  values: ParsedValues,
  template: string
): string =>
  template.replace(/\{([^}]+)\}/g, (_, token: string) =>
    resolveToken(weapon, row, values, token)
  );

const getRowStatus = (
  weapon: WeaponData,
  row: WeaponRowData,
  values: ParsedValues
): KitStatus => {
  if (row.status === 'included') {
    return 'included';
  }
  if (!isWeaponEquipped(weapon, values)) {
    return 'disabled';
  }
  return 'applied';
};

export const buildWeaponRows = (
  weapon: WeaponData,
  values: ParsedValues
): KitRow[] => [
  {
    id: 'weapon-base-atk',
    label: `Base ATK (Lv. ${weapon.level})`,
    value: String(weapon.baseAtk),
    status: 'included',
  },
  {
    id: SUBSTAT_ROW_IDS[weapon.substat.stat],
    label: `${SUBSTAT_LABELS[weapon.substat.stat]} (Lv. ${weapon.level})`,
    value: formatSubstatValue(weapon.substat.stat, weapon.substat.value),
    status: 'included',
  },
  ...weapon.rows.map((row) => ({
    id: row.id,
    label: fillTemplate(weapon, row, values, row.label),
    value: fillTemplate(weapon, row, values, row.template),
    status: getRowStatus(weapon, row, values),
    note: row.note,
  })),
];
