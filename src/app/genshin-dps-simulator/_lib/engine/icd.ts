import { z } from 'zod';

import icdGroupsJson from '../../_data/icdGroups.json';

// gcsim's elemental application ICD groups, by name: the frames until a
// tag's count restarts, and which of its hits apply their element (1),
// none (0) or a share of it. Past the end of the sequence, none.
const groupSchema = z.object({
  resetFrames: z.number().int().positive(),
  sequence: z.array(z.number().min(0).max(1)).min(1),
});
const ICD_GROUPS = z
  .record(z.unknown())
  .transform((raw) =>
    Object.fromEntries(
      Object.entries(raw)
        .filter(([name]) => !name.startsWith('_'))
        .map(([name, group]) => [name, groupSchema.parse(group)])
    )
  )
  .parse(icdGroupsJson);

export const DEFAULT_ICD_GROUP = 'standard';

export const isIcdGroup = (name: string): boolean => name in ICD_GROUPS;

// One character's ICD: each tag counts its hits from the first one, and
// starts over `resetFrames` after it.
export const createIcd = () => {
  const counters = new Map<string, { start: number; hits: number }>();
  return {
    // The share of its element a hit applies (1 untagged: every hit).
    applies: (
      tag: string | undefined,
      groupName: string | undefined,
      frame: number
    ): number => {
      if (!tag) {
        return 1;
      }
      const name = groupName ?? DEFAULT_ICD_GROUP;
      const group = ICD_GROUPS[name];
      if (!group) {
        throw new Error(`Unknown ICD group "${name}"`);
      }
      const counter = counters.get(tag);
      if (!counter || frame - counter.start >= group.resetFrames) {
        counters.set(tag, { start: frame, hits: 1 });
        return group.sequence[0];
      }
      counter.hits += 1;
      return group.sequence[counter.hits - 1] ?? 0;
    },
  };
};
