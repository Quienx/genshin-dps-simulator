// Runs a character the way the page does, for the tests.
import { CHARACTERS } from '../_lib/characters';
import { createDamageContext } from '../_lib/damageEngine';
import { parseValues } from '../_lib/simulationValues';
import { CritMode, SimulationValues } from '../_lib/types';

export const simulate = (
  values: SimulationValues,
  critMode: CritMode = 'expected'
) => {
  const parsed = parseValues(values);
  const context = createDamageContext(parsed, critMode);
  const result = CHARACTERS[values.character].simulate(context, parsed);
  return { parsed, context, result };
};

export const FRAME = 1 / 60;
