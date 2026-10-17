import { z } from 'zod';

import { Block } from '../schema';

// Bond of Life: a % of Max HP that absorbs healing. Shared by every
// character that uses it (Arlecchino, Clorinde, …); the kit's own blocks
// decide how it is gained and consumed.
const paramsSchema = z.object({
  max: z.number().positive().default(200),
  // Form field with the starting value.
  initialField: z.string().optional(),
});

export const BOND_OF_LIFE_ID = 'bondOfLife';

export const expandBondOfLife = (params: unknown): Block[] => {
  const { max, initialField } = paramsSchema.parse(params);
  return [
    {
      id: BOND_OF_LIFE_ID,
      type: 'resource',
      source: 'system',
      label: 'Bond of Life',
      min: 0,
      max,
      initial: initialField ? { field: initialField } : 0,
      noteFormat: 'percent',
    },
  ];
};
