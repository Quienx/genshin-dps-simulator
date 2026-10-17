import { CHARACTERS } from './characters';
import { createDamageContext } from './damageEngine';
import { simulateNormalOnlyRotation } from './normalOnlyRotation';
import { readNumber } from './readValue';
import { parseValues } from './simulationValues';
import {
  CharacterId,
  DamageContext,
  ParsedValues,
  SimulationOutcome,
  SimulationValues,
} from './types';

const simulateNormalOnlyIfSupported = (
  characterId: CharacterId,
  values: ParsedValues
): DamageContext | null => {
  if (!CHARACTERS[characterId].hasNormalOnlyScenario) {
    return null;
  }
  return simulateNormalOnlyRotation(values);
};

const runSimulation = (
  values: SimulationValues,
  runId: number
): SimulationOutcome => {
  const parsedValues = parseValues(values);
  const character = CHARACTERS[values.character];
  const context = createDamageContext(parsedValues);
  const { details, rotationTrace, activity } = character.simulate(
    context,
    parsedValues
  );

  return {
    runId,
    characterId: values.character,
    characterName: character.name,
    enemyLevel: readNumber(parsedValues, 'enemyLevel'),
    duration: readNumber(parsedValues, 'duration'),
    context,
    details,
    rotationTrace,
    activity,
    normalOnlyContext: simulateNormalOnlyIfSupported(
      values.character,
      parsedValues
    ),
  };
};

export default runSimulation;
