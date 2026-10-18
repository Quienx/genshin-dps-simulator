import { z } from 'zod';

export const rotationActionKindSchema = z.enum([
  'normal',
  'charged',
  'skill',
  'burst',
  'plunge',
  // Movement that matters for the kit, e.g. surfing into an enemy.
  'move',
  'dodge',
  'wait',
  // A team member comes on the field and does nothing else.
  'swap',
]);

// An action the user can drop into a rotation. The character file lists its
// own actions; Dodge and Wait come from _data/actions/common.json.
// One step of a sequence: an action id, or an action played "hits" times
// (the block's count) and/or that must have been performed as another one
// (a Normal Attack that was a bite) to be recognized in a trace.
export const sequenceStepSchema = z.union([
  z.string(),
  z.object({
    action: z.string(),
    times: z.literal('hits').optional(),
    performed: z.union([z.string(), z.array(z.string())]).optional(),
  }),
]);

export const rotationActionSchema = z.object({
  id: z.string(),
  kind: rotationActionKindSchema,
  label: z.string(),
  shortLabel: z.string(),
  description: z.string().optional(),
  // Project Amber UI asset name; actions without one get a generic icon.
  icon: z.string().optional(),
  // Normal Attack: how many presses a block can hold (the combo length).
  maxHits: z.number().int().min(1).optional(),
  // Not a palette item: it is what another action turns into (Mualani's
  // bite is her Normal Attack while surfing).
  hidden: z.boolean().optional(),
  // Its hold (a hold E): what a block of it plays with Hold on.
  hold: z.string().optional(),
  // A held action's count (spins of a Charged Attack): the block's `hits`,
  // from 1 to `max`. With `hold`, the block sets how long it is held
  // instead (its `heldSeconds`, from `minFrames` to `maxFrames`); without
  // one it is held `releaseFrame` + (count - 1) × `everyFrames`.
  count: z
    .object({
      label: z.string(),
      max: z.number().int().min(1),
      hold: z
        .object({
          minFrames: z.number().int().min(0),
          // The shortest hold with no Final hit (none: `minFrames`).
          cancelMinFrames: z.number().int().min(1).optional(),
          maxFrames: z.number().int().min(1),
          releaseFrame: z.number().int().min(1),
          everyFrames: z.number().int().min(1),
          // Its repeated hits (the charges): the first, then every …
          firstHitFrame: z.number().int().min(0),
          // Its closing hit (the Final): frames after the release.
          closingAfterFrames: z.number().int().min(0).optional(),
          hitEveryFrames: z.number().int().min(1),
          // The next blocks (action ids or kinds) that cancel it.
          cancelledBy: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  // A sequence: one block that plays these actions in order (Mualani's
  // Surging Bite is three surfs into the enemy and a bite). Each one is
  // simulated as itself; the block only groups them.
  steps: z.array(sequenceStepSchema).min(1).optional(),
  // What a block's count means for a sequence (Wave Momentum before the
  // bite), and its lowest value (Normal Attacks: at least 1 hit).
  hitsLabel: z.string().optional(),
  minHits: z.number().int().min(0).optional(),
  defaultSeconds: z.number().positive().optional(),
  recoveryFrames: z.number().int().min(0).optional(),
});

export const rotationDataSchema = z.object({
  // How the built-in priority logic picks actions, shown in Automatic mode.
  automaticDescription: z.string(),
  actions: z.array(rotationActionSchema).min(1),
});

export const commonActionsSchema = z.object({
  actions: z.array(rotationActionSchema),
});

export type RotationActionKind = z.infer<typeof rotationActionKindSchema>;
export type RotationAction = z.infer<typeof rotationActionSchema>;
export type SequenceStep = z.infer<typeof sequenceStepSchema>;
export type RotationData = z.infer<typeof rotationDataSchema>;
