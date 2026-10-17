import { computeScreenStats } from './artifacts';
import { getCharacterData } from './characterData';
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

export const buildDefaultValues = (
  characterId: CharacterId
): SimulationValues => {
  const character = CHARACTERS[characterId];
  return {
    character: characterId,
    numbers: {
      ...toStringRecord({
        ...COMMON_NUMBER_DEFAULTS,
        ...character.numberDefaults,
        ...ENEMY_DUMMY_DEFAULTS,
      }),
    },
    flags: { ...character.flagDefaults },
    rotation: null,
  };
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

// While artifacts are on, the stat totals come from them, not the fields.
export const parseValues = (values: SimulationValues): ParsedValues => {
  const parsed: ParsedValues = {
    numbers: Object.fromEntries(
      Object.entries(values.numbers).map(([name, value]) => [
        name,
        parseNumber(name, value),
      ])
    ),
    flags: values.flags,
    rotation: values.rotation,
  };
  if (!values.artifacts?.enabled) {
    return parsed;
  }
  return {
    ...parsed,
    numbers: {
      ...parsed.numbers,
      ...computeScreenStats(
        getCharacterData(values.character),
        parsed,
        values.artifacts
      ),
    },
  };
};

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
