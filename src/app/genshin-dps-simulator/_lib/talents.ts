import {
  MultiplierRowData,
  MultiplierStat,
  TalentData,
  TalentRowData,
} from './characterSchema';
import formatNumber from './formatNumber';
import { readFlag, readNumber } from './readValue';
import { ParsedValues } from './types';

export const MAX_BASE_TALENT_LEVEL = 10;
export const CONSTELLATION_TALENT_BOOST = 3;

export type TalentLevelSource = {
  levelField: string;
  boostedBy: string | null;
  levelCount: number;
};

export const clampBaseTalentLevel = (level: number): number =>
  Math.min(MAX_BASE_TALENT_LEVEL, Math.max(1, Math.floor(level)));

const getConstellationBoost = (
  values: ParsedValues,
  boostedBy: string | null
): number => {
  if (!boostedBy) {
    return 0;
  }
  if (!readFlag(values, boostedBy)) {
    return 0;
  }
  return CONSTELLATION_TALENT_BOOST;
};

export const getBaseTalentLevel = (
  values: ParsedValues,
  source: TalentLevelSource
): number => clampBaseTalentLevel(readNumber(values, source.levelField));

export const getEffectiveTalentLevel = (
  values: ParsedValues,
  source: TalentLevelSource
): number =>
  Math.min(
    source.levelCount,
    getBaseTalentLevel(values, source) +
      getConstellationBoost(values, source.boostedBy)
  );

export const pickLevelValue = (perLevel: number[], level: number): number =>
  perLevel[Math.min(perLevel.length, Math.max(1, Math.floor(level))) - 1] ?? 0;

const STAT_LABELS: Record<MultiplierStat, string> = {
  atk: 'ATK',
  hp: 'Max HP',
  def: 'DEF',
  em: 'EM',
  flat: '',
};

type CharacterTalents = {
  name: string;
  talents: TalentData[];
};

export const getTalent = (
  character: CharacterTalents,
  talentId: string
): TalentData => {
  const talent = character.talents.find((entry) => entry.id === talentId);
  if (!talent) {
    throw new Error(`${character.name} has no talent "${talentId}"`);
  }
  return talent;
};

const isMultiplierRow = (row: TalentRowData): row is MultiplierRowData =>
  row.type === 'multiplier';

const getMultiplierRows = (talent: TalentData): MultiplierRowData[] =>
  talent.rows.filter(isMultiplierRow);

export const toLevelSource = (talent: TalentData): TalentLevelSource => ({
  levelField: talent.levelField,
  boostedBy: talent.boostedBy,
  levelCount: Math.min(
    ...getMultiplierRows(talent).flatMap((row) =>
      row.components.map((component) => component.values.length)
    )
  ),
});

export const getMultiplierRow = (
  talent: TalentData,
  rowId: string
): MultiplierRowData => {
  const row = getMultiplierRows(talent).find((entry) => entry.id === rowId);
  if (!row) {
    throw new Error(`Talent "${talent.id}" has no multiplier "${rowId}"`);
  }
  return row;
};

const getModifierBonus = (
  row: MultiplierRowData,
  values: ParsedValues
): number =>
  (row.modifiers ?? [])
    .filter((modifier) => readFlag(values, modifier.whenFlag))
    .reduce((total, modifier) => total + modifier.add, 0);

const getComponentValues = (
  row: MultiplierRowData,
  level: number,
  values: ParsedValues
): number[] =>
  row.components.map(
    (component, index) =>
      pickLevelValue(component.values, level) +
      getFirstComponentBonus(index, getModifierBonus(row, values))
  );

const getFirstComponentBonus = (index: number, bonus: number): number => {
  if (index !== 0) {
    return 0;
  }
  return bonus;
};

// Simulations work with single-stat multipliers; this returns that stat's
// value at the given level, including active modifiers (e.g. C1 Masque +100%).
export const getMultiplierValue = (
  talent: TalentData,
  rowId: string,
  level: number,
  values: ParsedValues
): number =>
  getComponentValues(getMultiplierRow(talent, rowId), level, values)[0];

const formatComponent = (
  stat: MultiplierStat,
  value: number,
  hits: number
): string => {
  const amount = formatAmount(stat, value);
  const repeated = Array.from({ length: hits }, () => amount).join(' + ');
  return [repeated, STAT_LABELS[stat]].filter(Boolean).join(' ');
};

const formatAmount = (stat: MultiplierStat, value: number): string => {
  if (stat === 'flat') {
    return formatNumber(value);
  }
  return `${formatNumber(value)}%`;
};

export const formatMultiplierRow = (
  row: MultiplierRowData,
  level: number,
  values: ParsedValues
): string => {
  const componentValues = getComponentValues(row, level, values);
  const formatted = row.components
    .map((component, index) =>
      formatComponent(component.stat, componentValues[index], row.hits ?? 1)
    )
    .join(' + ');
  return [formatted, row.suffix].filter(Boolean).join(' ');
};

const TALENT_TITLE_PREFIXES: Record<TalentData['kind'], string> = {
  normal: 'Normal Attack',
  skill: 'Elemental Skill (E)',
  burst: 'Elemental Burst (Q)',
};

const TALENT_TEST_IDS: Record<TalentData['kind'], string> = {
  normal: 'normal-attack',
  skill: 'skill',
  burst: 'burst',
};

export const getTalentTitle = (talent: TalentData): string =>
  `${TALENT_TITLE_PREFIXES[talent.kind]}: ${talent.name}`;

export const getTalentTestId = (talent: TalentData): string =>
  TALENT_TEST_IDS[talent.kind];

// Multiplier of a "talentId/rowId" reference (as used by action hits) at
// the character's effective level for that talent.
export const getRowMultiplier = (
  character: CharacterTalents,
  ref: string,
  values: ParsedValues
): number => getRowScaling(character, ref, values)[0].value;

// One part of a hit's base DMG: `value` % of a stat, or a flat amount.
export type StatScaling = { stat: MultiplierStat; value: number };

// Every component of a "talentId/rowId" row (e.g. 150% ATK + 300% EM), at
// the character's effective level for that talent.
export const getRowScaling = (
  character: CharacterTalents,
  ref: string,
  values: ParsedValues
): StatScaling[] => {
  const [talentId, rowId] = ref.split('/');
  const talent = getTalent(character, talentId);
  const row = getMultiplierRow(talent, rowId);
  const componentValues = getComponentValues(
    row,
    getEffectiveTalentLevel(values, toLevelSource(talent)),
    values
  );
  return row.components.map((component, index) => ({
    stat: component.stat,
    value: componentValues[index],
  }));
};
