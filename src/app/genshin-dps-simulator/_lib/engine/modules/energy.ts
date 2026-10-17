import { z } from 'zod';

import { Block } from '../schema';
import { CharacterData } from '../../characterSchema';
import { readNumber } from '../../readValue';
import { ParsedValues } from '../../types';

// Energy: what the Q costs. Particles (the `particles` op, usually on an E
// hit trigger) give `perParticle` × Energy Recharge; `addResource: "energy"`
// is flat Energy that ignores Energy Recharge (e.g. "restores 15 Energy").
// Casting an action with an `energyCost` needs that much and spends it.
// Normal and Charged Attack hits may also restore 1 Energy (see
// `createHitEnergy`).
const paramsSchema = z.object({
  // Form field with the Energy Recharge %.
  rechargeField: z.string().default('energyRecharge'),
  // Form field with the Energy at the start.
  initialField: z.string().optional(),
  // A particle of the character's own element caught on field.
  perParticle: z.number().positive().default(3),
});

export const ENERGY_ID = 'energy';
// What Normal / Charged Attack hits restored so far, for the timeline.
export const HIT_ENERGY_ID = 'hitEnergy';

const getBurstCost = (character: CharacterData): number => {
  const cost = character.talents.find(
    (talent) => talent.kind === 'burst'
  )?.energyCost;
  if (cost === undefined) {
    throw new Error(
      `${character.name} uses the "energy" system but its Q has no energyCost`
    );
  }
  return cost;
};

export const expandEnergy = (
  params: unknown,
  character: CharacterData
): Block[] => {
  const { initialField } = paramsSchema.parse(params);
  return [
    {
      id: ENERGY_ID,
      type: 'resource',
      source: 'system',
      label: 'Energy',
      min: 0,
      max: getBurstCost(character),
      initial: initialField ? { field: initialField } : 0,
    },
    {
      id: HIT_ENERGY_ID,
      type: 'resource',
      source: 'system',
      label: 'Energy from Normal / Charged hits',
      min: 0,
      // A running total: the timeline scales it to its highest value.
      max: Number.POSITIVE_INFINITY,
      initial: 0,
    },
  ];
};

export type EnergyConfig = {
  // Energy one particle gives with this build's Energy Recharge.
  perParticle: number;
  // Same for a clear (elementless) particle, e.g. one an enemy drops.
  perClearParticle: number;
};

// A clear particle caught on field (a 4-member party), before Energy
// Recharge.
const CLEAR_PARTICLE_ENERGY = 2;

// Null when the character does not use the system (its casts are free).
export const getEnergyConfig = (
  character: CharacterData,
  values: ParsedValues
): EnergyConfig | null => {
  const params = character.systems.energy;
  if (!params) {
    return null;
  }
  const { rechargeField, perParticle } = paramsSchema.parse(params);
  const recharge = Math.max(0, readNumber(values, rechargeField)) / 100;
  return {
    perParticle: perParticle * recharge,
    perClearParticle: CLEAR_PARTICLE_ENERGY * recharge,
  };
};

// Normal and Charged Attack hits have a chance to restore 1 flat Energy: it
// starts at `base`, rises by `perMiss` after each hit that gives none and
// goes back to `base` when one does; then no hit gives any for 0.2 s
// (gcsim's SetupOnNormalHitEnergy, from the wiki's "Energy" page).
const HIT_ENERGY_CHANCES: Record<string, { base: number; perMiss: number }> = {
  Sword: { base: 0.1, perMiss: 0.05 },
  Claymore: { base: 0, perMiss: 0.1 },
  Polearm: { base: 0, perMiss: 0.04 },
  Bow: { base: 0, perMiss: 0.05 },
  Catalyst: { base: 0, perMiss: 0.1 },
};

const HIT_ENERGY_ICD_FRAMES = 12;

// Energy a Normal / Charged Attack hit restores. Expected-damage runs need
// a stable result: they follow the odds of every chance level at once and
// return the average (without the 0.2 s ICD, which rarely matters between
// hits); random runs roll.
export const createHitEnergy = (
  weaponType: string,
  mode: 'expected' | 'random'
): ((frame: number) => number) => {
  const chances = HIT_ENERGY_CHANCES[weaponType];
  if (!chances) {
    throw new Error(`No Normal Attack Energy chances for "${weaponType}"`);
  }
  const chanceAt = (misses: number) =>
    Math.min(1, chances.base + chances.perMiss * misses);

  if (mode === 'expected') {
    // Probability of each number of misses in a row.
    let odds = [1];
    return () => {
      let gained = 0;
      const next: number[] = [0];
      odds.forEach((probability, misses) => {
        const chance = chanceAt(misses);
        gained += probability * chance;
        next[0] += probability * chance;
        next[misses + 1] = (next[misses + 1] ?? 0) + probability * (1 - chance);
      });
      odds = next;
      return gained;
    };
  }

  let misses = 0;
  let readyFrame = 0;
  return (frame) => {
    if (frame < readyFrame) {
      return 0;
    }
    if (Math.random() >= chanceAt(misses)) {
      misses += 1;
      return 0;
    }
    misses = 0;
    readyFrame = frame + HIT_ENERGY_ICD_FRAMES;
    return 1;
  };
};
