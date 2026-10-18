import { MAX_DURATION_SECONDS } from './frames';
import {
  CharacterDefinition,
  FieldDefinition,
  FieldSection,
  NumberFieldDefinition,
  ScalingStat,
} from './types';

const STAT_FIELDS: Record<ScalingStat, NumberFieldDefinition> = {
  atk: {
    kind: 'number',
    section: 'stats',
    name: 'atk',
    label: 'Total ATK',
    min: 0,
  },
  hp: {
    kind: 'number',
    section: 'stats',
    name: 'hp',
    label: 'Total Max HP',
    min: 0,
  },
  def: {
    kind: 'number',
    section: 'stats',
    name: 'def',
    label: 'Total DEF',
    min: 0,
  },
};

const buildCommonFields = (
  character: CharacterDefinition
): NumberFieldDefinition[] => [
  ...character.stats.map((stat) => STAT_FIELDS[stat]),
  {
    kind: 'number',
    section: 'stats',
    name: 'cr',
    label: 'CRIT Rate (%)',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    kind: 'number',
    section: 'stats',
    name: 'cd',
    label: 'CRIT DMG (%)',
    min: 0,
    step: 0.1,
  },
  {
    kind: 'number',
    section: 'stats',
    name: 'bonus',
    label: 'Extra DMG Bonus (%)',
    step: 0.1,
  },
  {
    kind: 'number',
    section: 'stats',
    name: 'elementalBonus',
    label: character.elementalLabel,
    step: 0.1,
  },
  {
    kind: 'number',
    section: 'stats',
    name: 'em',
    label: 'Elemental Mastery',
    min: 0,
  },
  {
    kind: 'number',
    section: 'stats',
    name: 'reactionBonus',
    label: 'Reaction DMG Bonus (%)',
    step: 0.1,
  },
  {
    kind: 'number',
    section: 'rotation',
    name: 'duration',
    label: 'Simulation length (seconds)',
    min: 1,
    max: MAX_DURATION_SECONDS,
  },
];

// Why a number field's text is not a valid value (null: it is): empty,
// not a number, out of its range, or not whole when it steps by whole
// numbers (a refinement, Energy).
export const numberFieldError = (
  value: string,
  { min, max, step }: { min?: number; max?: number; step?: number }
): string | null => {
  const text = value.trim();
  if (text === '') {
    return 'Enter a number';
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    return 'Not a number';
  }
  if (min !== undefined && number < min) {
    return `At least ${min}`;
  }
  if (max !== undefined && number > max) {
    return `At most ${max}`;
  }
  if (
    step !== undefined &&
    Number.isInteger(step) &&
    !Number.isInteger(number)
  ) {
    return 'A whole number';
  }
  return null;
};

// The nearest valid value (in range, whole when it steps by whole numbers);
// the text unchanged when it is not a number at all.
export const clampNumberField = (
  value: string,
  { min, max, step }: { min?: number; max?: number; step?: number }
): string => {
  const number = Number(value.trim());
  if (value.trim() === '' || !Number.isFinite(number)) {
    return value;
  }
  const whole =
    step !== undefined && Number.isInteger(step) ? Math.round(number) : number;
  const clamped = Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, whole)
  );
  return String(clamped);
};

const getCommonFields = (
  character: CharacterDefinition
): NumberFieldDefinition[] => buildCommonFields(character);

export const getFieldsBySection = (
  character: CharacterDefinition,
  section: FieldSection
): FieldDefinition[] =>
  [...getCommonFields(character), ...character.fields].filter(
    (field) => field.section === section
  );

export default getCommonFields;
