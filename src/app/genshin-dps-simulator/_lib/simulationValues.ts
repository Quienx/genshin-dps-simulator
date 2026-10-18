import { computeScreenStats, swapGearTotals } from './artifacts';
import { Gear, getFileGear, getLoadedVariant } from './characterData';
import { CHARACTERS } from './characters';
import { ENEMY_DUMMY_DEFAULTS, ENEMY_DUMMY_FIELD_NAMES } from './enemyDummy';
import { MAX_DURATION_SECONDS } from './frames';
import { RotationSetting } from './rotation/types';
import {
  ArtifactBuild,
  CharacterId,
  ParsedValues,
  SimulationValues,
} from './types';

const COMMON_NUMBER_DEFAULTS: Record<string, number> = {
  cr: 70,
  cd: 200,
  bonus: 0,
  elementalBonus: 46.6,
  em: 0,
  reactionBonus: 0,
  duration: 60,
};

const toStringRecord = (
  numbers: Record<string, number>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(numbers).map(([name, value]) => [name, String(value)])
  );

// A character file's defaults as form values (one not registered too: a
// draft checked by scripts/scaffold/check.ts).
export const buildDefaultValuesFor = (character: {
  id: string;
  defaults: {
    numbers: Record<string, number>;
    flags: Record<string, boolean>;
  };
}): SimulationValues => ({
  character: character.id as CharacterId,
  numbers: {
    ...toStringRecord({
      ...COMMON_NUMBER_DEFAULTS,
      ...character.defaults.numbers,
      ...ENEMY_DUMMY_DEFAULTS,
    }),
  },
  flags: { ...character.defaults.flags },
  rotation: null,
});

export const buildDefaultValues = (
  characterId: CharacterId
): SimulationValues => {
  const character = CHARACTERS[characterId];
  return buildDefaultValuesFor({
    id: characterId,
    defaults: {
      numbers: character.numberDefaults,
      flags: character.flagDefaults,
    },
  });
};

const pickEnemyDummyValues = (
  values: SimulationValues
): Record<string, string> =>
  Object.fromEntries(
    ENEMY_DUMMY_FIELD_NAMES.map((name) => [
      name,
      values.numbers[name] ?? String(ENEMY_DUMMY_DEFAULTS[name] ?? 0),
    ])
  );

export const switchCharacter = (
  values: SimulationValues,
  characterId: CharacterId
): SimulationValues => {
  const defaults = buildDefaultValues(characterId);
  return {
    ...defaults,
    numbers: {
      ...defaults.numbers,
      ...pickEnemyDummyValues(values),
    },
  };
};

// The run length stays at least 1 s, also when the field is empty.
const parseNumber = (name: string, value: string): number => {
  const number = Number(value);
  if (name !== 'duration') {
    return number;
  }
  return Math.min(
    MAX_DURATION_SECONDS,
    Math.max(1, Number.isFinite(number) ? number : 1)
  );
};

// The build's gear, when it wears something else than its file's.
const gearOf = (values: SimulationValues): Gear => ({
  ...(values.weapon ? { weapon: values.weapon } : {}),
  ...(values.artifactSet ? { artifactSet: values.artifactSet } : {}),
});

// While artifacts are on, the stat totals come from them, not the fields.
// Gear switched in fills the flags and numbers it brings (its weapon's
// flag and refinement, its set bonuses) that the build does not have.
export const parseValues = (values: SimulationValues): ParsedValues => {
  const gear = gearOf(values);
  const switched = Boolean(gear.weapon || gear.artifactSet);
  // Only gear or artifacts need the file: a character not registered yet
  // (scripts/scaffold/check.ts) parses with its own gear.
  const character =
    switched || values.artifacts?.enabled
      ? getLoadedVariant(values.character, gear).character
      : null;
  const parsed: ParsedValues = {
    numbers: {
      ...(switched && character ? character.defaults.numbers : {}),
      ...Object.fromEntries(
        Object.entries(values.numbers).map(([name, value]) => [
          name,
          parseNumber(name, value),
        ])
      ),
    },
    flags: {
      ...(switched && character ? character.defaults.flags : {}),
      ...values.flags,
    },
    rotation: values.rotation,
    ...gear,
  };
  if (!values.artifacts?.enabled || !character) {
    return parsed;
  }
  return {
    ...parsed,
    numbers: {
      ...parsed.numbers,
      ...computeScreenStats(character, parsed, values.artifacts),
    },
  };
};

// Wears another catalog weapon or set (its file's id: back to it). The
// flags and numbers the new entry brings start at its defaults.
export const withGear = (
  values: SimulationValues,
  gear: Gear
): SimulationValues => {
  const fileGear = getFileGear(values.character);
  const next: SimulationValues = { ...values };
  if (gear.weapon !== undefined) {
    next.weapon = gear.weapon === fileGear.weapon ? undefined : gear.weapon;
  }
  if (gear.artifactSet !== undefined) {
    next.artifactSet =
      gear.artifactSet === fileGear.artifactSet ? undefined : gear.artifactSet;
  }
  const { character } = getLoadedVariant(next.character, gearOf(next));
  const { weapon, artifactSet } = character;
  const flags = { ...next.flags };
  const numbers = { ...next.numbers };
  if (gear.weapon !== undefined) {
    flags[weapon.enabledFlag] =
      character.defaults.flags[weapon.enabledFlag] ?? true;
    numbers[weapon.refinementField] = String(
      character.defaults.numbers[weapon.refinementField] ?? 1
    );
  }
  if (gear.artifactSet !== undefined) {
    artifactSet.rows.forEach((row) => {
      if (row.flag) {
        flags[row.flag] = character.defaults.flags[row.flag] ?? true;
      }
    });
  }
  // Typed screen totals follow the gear (artifacts compute their own).
  if (!values.artifacts?.enabled) {
    const from = {
      character: getLoadedVariant(values.character, gearOf(values)).character,
      values: parseValues(values),
    };
    const toValues = parseValues({ ...next, flags, numbers });
    const swapped = swapGearTotals(toValues.numbers, from, {
      character,
      values: toValues,
    });
    const round = (value: number) => String(Math.round(value * 10) / 10);
    SWAPPED_FIELDS.forEach((field) => {
      if (field in swapped && swapped[field] !== toValues.numbers[field]) {
        numbers[field] = round(swapped[field]);
      }
    });
  }
  return { ...next, flags, numbers };
};

// Another weapon refinement: an on-screen passive that grows with it
// (Aquila Favonia's ATK%) moves the typed totals too.
export const withRefinement = (
  values: SimulationValues,
  value: string
): SimulationValues => {
  const { character } = getLoadedVariant(values.character, gearOf(values));
  const next: SimulationValues = {
    ...values,
    numbers: { ...values.numbers, [character.weapon.refinementField]: value },
  };
  if (values.artifacts?.enabled) {
    return next;
  }
  const fromValues = parseValues(values);
  const toValues = parseValues(next);
  const swapped = swapGearTotals(
    toValues.numbers,
    { character, values: fromValues },
    { character, values: toValues }
  );
  const numbers = { ...next.numbers };
  SWAPPED_FIELDS.forEach((field) => {
    if (field in swapped && swapped[field] !== toValues.numbers[field]) {
      numbers[field] = String(Math.round(swapped[field] * 10) / 10);
    }
  });
  return { ...next, numbers };
};

// The typed totals a gear change moves.
const SWAPPED_FIELDS = [
  'atk',
  'hp',
  'def',
  'em',
  'cr',
  'cd',
  'energyRecharge',
  'elementalBonus',
  'physicalBonus',
];

export const withArtifacts = (
  values: SimulationValues,
  artifacts: ArtifactBuild
): SimulationValues => ({ ...values, artifacts });

export const withNumber = (
  values: SimulationValues,
  name: string,
  value: string
): SimulationValues => ({
  ...values,
  numbers: { ...values.numbers, [name]: value },
});

export const withRotation = (
  values: SimulationValues,
  rotation: RotationSetting | null
): SimulationValues => ({ ...values, rotation });

export const withFlag = (
  values: SimulationValues,
  name: string,
  checked: boolean
): SimulationValues => ({
  ...values,
  flags: { ...values.flags, [name]: checked },
});
