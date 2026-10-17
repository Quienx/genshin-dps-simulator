import { DamageElement, NumberFieldDefinition } from './types';

export const ENEMY_DUMMY_DEFAULTS: Record<string, number> = {
  enemyLevel: 100,
  enemyDefReduction: 0,
  // Clear Elemental Particles it drops as it takes damage: `enemyParticles`
  // every `enemyParticleEvery` % of `enemyHp` (0 HP: none). The default is
  // the DPS test enemy (~1.8M HP).
  enemyHp: 1800000,
  enemyParticleEvery: 20,
  enemyParticles: 1,
  resPyro: 10,
  resHydro: 10,
  resElectro: 10,
  resCryo: 10,
  resAnemo: 10,
  resGeo: 10,
  resDendro: 10,
  resPhysical: 10,
};

const resistanceField = (
  name: string,
  label: string
): NumberFieldDefinition => ({
  kind: 'number',
  section: 'enemy',
  name,
  label: `RES ${label} (%)`,
  min: -100,
  max: 100,
});

export const ENEMY_DUMMY_STAT_FIELDS: NumberFieldDefinition[] = [
  {
    kind: 'number',
    section: 'enemy',
    name: 'enemyLevel',
    label: 'Level',
    min: 1,
    max: 200,
  },
  {
    kind: 'number',
    section: 'enemy',
    name: 'enemyDefReduction',
    label: 'DEF reduction (%)',
    min: 0,
    max: 100,
  },
  {
    kind: 'number',
    section: 'enemy',
    name: 'enemyHp',
    label: 'HP (for particle drops; 0 = none)',
    min: 0,
  },
  {
    kind: 'number',
    section: 'enemy',
    name: 'enemyParticleEvery',
    label: 'Drops clear particles every (% of HP)',
    min: 0.1,
    max: 100,
    step: 0.1,
  },
  {
    kind: 'number',
    section: 'enemy',
    name: 'enemyParticles',
    label: 'Clear particles per drop',
    min: 0,
    step: 1,
  },
];

export const ENEMY_DUMMY_RESISTANCE_FIELDS: NumberFieldDefinition[] = [
  resistanceField('resPyro', 'Pyro'),
  resistanceField('resHydro', 'Hydro'),
  resistanceField('resElectro', 'Electro'),
  resistanceField('resCryo', 'Cryo'),
  resistanceField('resAnemo', 'Anemo'),
  resistanceField('resGeo', 'Geo'),
  resistanceField('resDendro', 'Dendro'),
  resistanceField('resPhysical', 'Physical'),
];

export const ENEMY_DUMMY_FIELD_NAMES = Object.keys(ENEMY_DUMMY_DEFAULTS);

// Each element has a "res<Element>" field (resPyro, resElectro, …).
export const getResistanceFieldName = (element: DamageElement): string =>
  `res${element}`;

// The elements a character deals damage with: its own, plus Physical.
export const getCharacterDamageElements = (
  element: Exclude<DamageElement, 'Physical'>
): DamageElement[] => [element, 'Physical'];
