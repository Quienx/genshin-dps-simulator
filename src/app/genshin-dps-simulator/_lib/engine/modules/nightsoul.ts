import { z } from 'zod';

import {
  Block,
  blockSchema,
  flagNumberSchema,
  frames,
  opSchema,
} from '../schema';

// Nightsoul (Natlan): points, the Nightsoul's Blessing state and the
// party's Nightsoul Burst. Shared by every Natlan character; the kit's own
// blocks decide how points are gained and what the Blessing changes.
//
// Ids the kit can refer to: the resource "nightsoul", the status
// "nightsoulBlessing" and the counter "nightsoulBursts".
const paramsSchema = z
  .object({
    // A number, or one by a flag (Mavuika's C1: 120 instead of 80).
    maxPoints: flagNumberSchema,
    label: z.string().default('Nightsoul points'),
    icon: z.string().optional(),
    blessing: z
      .object({
        label: z.string().default("Nightsoul's Blessing"),
        icon: z.string().optional(),
        // Points drain while it lasts and it ends when they run out
        // (Mualani's surfing).
        drain: z
          .object({
            everyFrames: frames.positive(),
            amount: z.number().positive().default(1),
            firstAfterFrames: frames.optional(),
          })
          .optional(),
        // Or it lasts a fixed time (Varesa's Fiery Passion).
        durationFrames: frames.optional(),
        // Entered by itself when the points reach the maximum.
        enterAtMax: z.boolean().default(false),
        // Points go back to 0 when it ends.
        resetPointsOnEnd: z.boolean().default(false),
      })
      .refine((blessing) => !(blessing.drain && blessing.durationFrames), {
        message: 'A Blessing either drains points or lasts "durationFrames"',
      }),
    // The party's Nightsoul Burst: on a hit, once every 18 / 12 / 9 s with
    // 1 / 2 / 3+ Natlan party members (form field `partyField`).
    nightsoulBurst: z
      .object({
        label: z.string().default('Nightsoul Burst'),
        icon: z.string().optional(),
        partyField: z.string().default('natlanPartyMembers'),
        // What the kit does on each Nightsoul Burst (its passives).
        do: z.array(opSchema).default([]),
      })
      .optional(),
  })
  .strict()
  .refine(
    (params) =>
      !params.blessing.enterAtMax || typeof params.maxPoints === 'number',
    { message: '"enterAtMax" needs a number "maxPoints"' }
  );

// The number field a kit's Nightsoul Burst reads for its party size
// (null: the kit has no Nightsoul Burst). A team run sets it from the
// party, so it is never typed in.
export const nightsoulPartyField = (
  systems: Record<string, unknown>
): string | null => {
  const params = systems.nightsoul as
    | { nightsoulBurst?: { partyField?: string } }
    | undefined;
  if (!params?.nightsoulBurst) {
    return null;
  }
  return params.nightsoulBurst.partyField ?? 'natlanPartyMembers';
};

export const NIGHTSOUL_ID = 'nightsoul';
export const NIGHTSOUL_BLESSING_ID = 'nightsoulBlessing';

// Party members -> ICD of the Nightsoul Burst, in frames.
const NIGHTSOUL_BURST_ICDS = [
  { min: undefined, max: 2, frames: 18 * 60 },
  { min: 2, max: 3, frames: 12 * 60 },
  { min: 3, max: undefined, frames: 9 * 60 },
];

export const expandNightsoul = (params: unknown): Block[] => {
  const { maxPoints, label, icon, blessing, nightsoulBurst } =
    paramsSchema.parse(params);
  // Written as the file would be, then parsed for the schema's defaults.
  const blocks: z.input<typeof blockSchema>[] = [
    {
      id: NIGHTSOUL_ID,
      type: 'resource',
      source: 'system',
      label,
      icon,
      min: 0,
      max: maxPoints,
    },
    {
      id: NIGHTSOUL_BLESSING_ID,
      type: 'status',
      source: 'system',
      label: blessing.label,
      icon: blessing.icon ?? icon,
      durationFrames: blessing.durationFrames,
      drain: blessing.drain && {
        resource: NIGHTSOUL_ID,
        ...blessing.drain,
      },
    },
  ];
  if (blessing.enterAtMax && typeof maxPoints === 'number') {
    blocks.push({
      id: 'nightsoul-enter-blessing',
      type: 'trigger',
      source: 'system',
      label: `Full ${label}: ${blessing.label}`,
      icon: blessing.icon ?? icon,
      when: { resourceChanges: NIGHTSOUL_ID },
      if: {
        all: [
          { resource: NIGHTSOUL_ID, gte: maxPoints },
          { not: { status: NIGHTSOUL_BLESSING_ID } },
        ],
      },
      do: [{ applyStatus: NIGHTSOUL_BLESSING_ID }],
    });
  }
  if (blessing.resetPointsOnEnd) {
    blocks.push({
      id: 'nightsoul-reset-points',
      type: 'trigger',
      source: 'system',
      label: `${blessing.label} ends: ${label} back to 0`,
      icon: blessing.icon ?? icon,
      when: { statusEnds: NIGHTSOUL_BLESSING_ID },
      do: [{ setResource: NIGHTSOUL_ID, value: 0 }],
    });
  }
  if (nightsoulBurst) {
    NIGHTSOUL_BURST_ICDS.forEach(({ min, max, frames: icd }, index) => {
      blocks.push({
        id: `nightsoul-burst-${index + 1}`,
        type: 'trigger',
        source: 'system',
        label: nightsoulBurst.label,
        icon: nightsoulBurst.icon,
        // Any party member's Elemental DMG (not Physical).
        when: { hit: 'party:elemental' },
        if: {
          field: nightsoulBurst.partyField,
          ...(min === undefined ? {} : { gte: min }),
          ...(max === undefined ? {} : { lt: max }),
        },
        icdFrames: icd,
        do: [{ count: 'nightsoulBursts' }, ...nightsoulBurst.do],
      });
    });
  }
  return blocks.map((block) => blockSchema.parse(block));
};
