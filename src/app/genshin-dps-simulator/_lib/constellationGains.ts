import { CHARACTERS } from './characters';
import { createDamageContext } from './damageEngine';
import { readNumber } from './readValue';
import { parseValues } from './simulationValues';
import { SimulationValues } from './types';

export type DamageGain = {
  dps: number;
  percent: number;
};

export type ConstellationLevel = {
  id: string;
  level: number;
};

export type ConstellationGains = {
  byConstellation: Record<string, DamageGain>;
  total: DamageGain;
};

const withConstellationsUpTo = (
  values: SimulationValues,
  constellations: ConstellationLevel[],
  level: number
): SimulationValues => ({
  ...values,
  flags: {
    ...values.flags,
    ...Object.fromEntries(
      constellations.map((constellation) => [
        constellation.id,
        constellation.level <= level,
      ])
    ),
  },
});

const simulateExpectedDps = (values: SimulationValues): number => {
  const parsedValues = parseValues(values);
  const context = createDamageContext(parsedValues, 'expected');
  CHARACTERS[values.character].simulate(context, parsedValues);
  return (
    context.totalDamage / Math.max(1, readNumber(parsedValues, 'duration'))
  );
};

const getGain = (fromDps: number, toDps: number): DamageGain => {
  const dps = toDps - fromDps;
  if (fromDps <= 0) {
    return { dps, percent: 0 };
  }
  return { dps, percent: (dps / fromDps) * 100 };
};

export const getConstellationGains = (
  values: SimulationValues,
  constellations: ConstellationLevel[]
): ConstellationGains => {
  const dpsByLevel = [0, ...constellations.map((c) => c.level)].map((level) =>
    simulateExpectedDps(withConstellationsUpTo(values, constellations, level))
  );

  return {
    byConstellation: Object.fromEntries(
      constellations.map((constellation, index) => [
        constellation.id,
        getGain(dpsByLevel[index], dpsByLevel[index + 1]),
      ])
    ),
    total: getGain(dpsByLevel[0], dpsByLevel[dpsByLevel.length - 1]),
  };
};
