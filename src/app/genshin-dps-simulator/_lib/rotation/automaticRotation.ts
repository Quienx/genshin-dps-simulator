import { getRotationActions, traceToRotation } from './blocks';
import { RotationSetting, RotationTraceEntry } from './types';
import { CHARACTERS } from '../characters';
import { createDamageContext } from '../damageEngine';
import { readNumber } from '../readValue';
import { parseValues, withRotation } from '../simulationValues';
import { CooldownTrack, HitLogEntry, SimulationValues } from '../types';

// DMG of the hits a rotation block's actions made, and its share of the
// run's total.
// `maxHit`: its biggest hit if it CRITs (what "Highest hit" can show).
export type BlockDamage = {
  damage: number;
  hits: number;
  share: number;
  maxHit: number;
  // Runs with CRITs rolled: how many of its hits CRIT.
  crits?: number;
};

export type ExpectedRun = {
  dps: number;
  duration: number;
  trace: RotationTraceEntry[];
  cooldowns: CooldownTrack[];
  damageByBlock: Record<string, BlockDamage>;
};

const getDamageByBlock = (
  hits: HitLogEntry[],
  total: number
): Record<string, BlockDamage> => {
  const byBlock: Record<string, BlockDamage> = {};
  hits.forEach((hit) => {
    if (!hit.blockUid) {
      return;
    }
    const entry = byBlock[hit.blockUid] ?? {
      damage: 0,
      hits: 0,
      share: 0,
      maxHit: 0,
    };
    entry.damage += hit.damage;
    entry.maxHit = Math.max(entry.maxHit, hit.maxDamage);
    entry.hits += 1;
    byBlock[hit.blockUid] = entry;
  });
  Object.values(byBlock).forEach((entry) => {
    entry.share = total > 0 ? entry.damage / total : 0;
  });
  return byBlock;
};

// Expected damage (no crit rolls), so repeated runs give the same numbers.
export const runExpected = (values: SimulationValues): ExpectedRun => {
  const parsed = parseValues(values);
  const context = createDamageContext(parsed, 'expected');
  const result = CHARACTERS[values.character].simulate(context, parsed);
  const duration = Math.max(1, readNumber(parsed, 'duration'));
  return {
    dps: context.totalDamage / duration,
    duration,
    trace: result.rotationTrace ?? [],
    cooldowns: result.cooldowns ?? [],
    damageByBlock: getDamageByBlock(context.hitLog, context.totalDamage),
  };
};

export const traceToCharacterRotation = (
  values: SimulationValues,
  trace: RotationTraceEntry[]
): RotationSetting => {
  const data = CHARACTERS[values.character].rotation;
  return traceToRotation(trace, data ? getRotationActions(data) : []);
};

// The blocks the automatic logic would play for this build: the starting
// point of a custom rotation.
export const buildAutomaticRotation = (
  values: SimulationValues
): RotationSetting =>
  traceToCharacterRotation(
    values,
    runExpected(withRotation(values, null)).trace
  );
