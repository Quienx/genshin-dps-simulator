import { z } from 'zod';

import { readNumber } from './readValue';
import { ParsedValues } from './types';
import reactionsJson from '../_data/reactions.json';

const reactionsSchema = z.object({
  // Reaction name -> triggering element -> base multiplier.
  amplifying: z.record(z.record(z.number().positive())),
  emBonus: z.object({ factor: z.number(), offset: z.number().positive() }),
  // Reaction name -> its multiplier and the element of its damage.
  transformative: z.record(
    z.object({
      multiplier: z.number().positive(),
      element: z.enum(['Pyro', 'Electro', 'Cryo', 'Hydro', 'Anemo', 'Dendro']),
    })
  ),
  // Base DMG of a transformative reaction at the character's level (90).
  transformativeLevelBase: z.number().positive(),
  transformativeEmBonus: z.object({
    factor: z.number(),
    offset: z.number().positive(),
  }),
});

const REACTIONS = reactionsSchema.parse(reactionsJson);

const getEmBonus = (
  elementalMastery: number,
  { factor, offset } = REACTIONS.emBonus
): number => {
  const em = Math.max(0, elementalMastery);
  return (factor * em) / (em + offset);
};

// Amplifying reactions scale with the triggering element: Hydro on Pyro is a
// 2x Vaporize, Pyro on Hydro only 1.5x. EM and reaction DMG bonuses add to
// the same (1 + ...) factor; `extraEm` comes from the hit's bonuses.
export const getReactionMultiplier = (
  values: ParsedValues,
  reaction: string,
  element: string,
  extraEm = 0
): number => {
  const base = REACTIONS.amplifying[reaction]?.[element];
  if (base === undefined) {
    return 1;
  }
  return (
    base *
    (1 +
      getEmBonus(readNumber(values, 'em') + extraEm) +
      readNumber(values, 'reactionBonus') / 100)
  );
};

export const TRANSFORMATIVE_REACTIONS = Object.keys(REACTIONS.transformative);

// Melt and Vaporize: they multiply the hit that triggers them.
export const isAmplifyingReaction = (reaction: string): boolean =>
  reaction in REACTIONS.amplifying;

// A transformative reaction (Overloaded) deals its own damage: level base ×
// reaction multiplier × (1 + EM bonus + reaction DMG bonus), before RES. It
// ignores DEF, CRIT and DMG Bonus; `extraEm` comes from the hit's bonuses.
export const getTransformativeReaction = (
  values: ParsedValues,
  reaction: string,
  extraEm = 0
) => {
  const data = REACTIONS.transformative[reaction];
  if (!data) {
    throw new Error(`Unknown transformative reaction "${reaction}"`);
  }
  const baseDamage =
    REACTIONS.transformativeLevelBase *
    data.multiplier *
    (1 +
      getEmBonus(
        readNumber(values, 'em') + extraEm,
        REACTIONS.transformativeEmBonus
      ) +
      readNumber(values, 'reactionBonus') / 100);
  return { element: data.element, baseDamage };
};
