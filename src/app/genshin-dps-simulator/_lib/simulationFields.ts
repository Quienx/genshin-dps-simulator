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
