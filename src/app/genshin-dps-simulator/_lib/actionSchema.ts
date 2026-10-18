import { z } from 'zod';

import { Condition, conditionSchema } from './engine/schema';
import {
  RotationAction,
  RotationActionKind,
  rotationActionKindSchema,
} from './rotation/rotationSchema';

// "talentId/rowId", e.g. "normalAttack/normal-4", for references from
// outside a talent (the kit's mechanics).
export const talentRowRefSchema = z
  .string()
  .regex(/^[\w-]+\/[\w-]+$/, 'Expected "talentId/rowId"');

const frameSchema = z.number().int().min(0);

const actionIdSchema = z.string().regex(/^[a-z][A-Za-z0-9-]*$/);

// Frames from the start of an action after which the next one can start,
// when it is this action id, group or kind ("plunge", "dodge", "skill");
// any other action waits for `end`. The most specific key wins.
const cancelsSchema = z.record(frameSchema);

// Timing of a multiplier row that is a hit the player performs. In the
// Normal Attack talent, the "normal" rows in order are the combo (N1, N2, …)
// and the "charged" row is the Charged Attack; in the E / Q talents, their
// rows are the hits of the cast. Any other `action` is one of a talent's
// extra `actions` (a hold E, a plunge). Rows without timing (e.g. Masque,
// Directive ticks) are used by the kit's own rules.
//
// Animations are not cancelled: the next action starts when this one ends.
export const rowTimingSchema = z.object({
  action: actionIdSchema,
  // Frame of each hit, counted from the start of the action.
  hitmarks: z.array(frameSchema).min(1),
  // Defaults to Physical for Normal / Charged and to the character's
  // element for E / Q.
  element: z
    .enum([
      'Pyro',
      'Hydro',
      'Electro',
      'Cryo',
      'Anemo',
      'Geo',
      'Dendro',
      'Physical',
    ])
    .optional(),
  // Normal / Charged: frame at which the animation ends and the next action
  // can start. E / Q end with the whole cast, on the talent.
  end: frameSchema.optional(),
  // Frames skipped when it directly follows a Normal Attack.
  windupSkippedAfterNormal: frameSchema.optional(),
  // Normal / Charged: earlier starts for some next actions.
  cancels: cancelsSchema.optional(),
  // Named moments the kit reacts to, e.g. { "absorb": 12 }.
  events: z.record(frameSchema).optional(),
  // Shown in the rotation editor, for what is particular to this character.
  note: z.string().optional(),
  // Naming for a non-standard action, e.g. Mualani's Normal Attack while
  // surfing is "Sharky's Bite".
  label: z.string().optional(),
  shortLabel: z.string().optional(),
  icon: z.string().optional(),
  // Category of its hits; defaults to the action's ("Normal", "Skill", …).
  category: z.string().optional(),
  // Element units each hit applies to the enemy (gcsim's durability / 25):
  // 1 by default, 2 for a strong hit, 0 for one that applies none.
  gauge: z.number().min(0).optional(),
  // Elemental application ICD tag (gcsim's): hits of the same character
  // sharing a tag apply their element on the 1st, 4th, 7th… hit, or the
  // first one 2.5 s after the count restarted. None: every hit applies.
  icd: z.string().optional(),
  // Its ICD group (gcsim's, in _data/icdGroups.json); "standard" if none.
  icdGroup: z.string().optional(),
});

export const cooldownSchema = z.object({
  frames: frameSchema,
  // Frames after the cast starts before the cooldown begins.
  delayFrames: frameSchema.default(0),
  // The cooldown waits for a `startCooldown` op instead (Mualani's E
  // cooldown starts when Nightsoul's Blessing ends); until then the action
  // is not ready.
  deferred: z.boolean().default(false),
  // Uses stored (an E with 2 charges); they recharge one at a time.
  charges: z.number().int().min(1).default(1),
});

type CooldownData = z.infer<typeof cooldownSchema>;

// An action of a talent besides its standard one, e.g. a hold E or a
// plunge. Its hits are the rows whose timing names its `id`. A variant of
// the E / Q (same kind, a hold E) shares that talent's cooldown and fires
// its "use" / "hit" triggers too; other kinds are actions of their own.
export const talentActionSchema = z.object({
  id: actionIdSchema,
  label: z.string(),
  shortLabel: z.string(),
  icon: z.string().optional(),
  note: z.string().optional(),
  // The rotation editor's kind; defaults to the talent's (Normal Attack
  // talent: "plunge").
  kind: rotationActionKindSchema.exclude(['dodge', 'wait']).optional(),
  // Frame at which it ends and the next action can start.
  end: frameSchema,
  cancels: cancelsSchema.optional(),
  cooldown: cooldownSchema.optional(),
  // A cooldown of its own (e.g. an ICD) instead of the talent's.
  cooldownId: actionIdSchema.optional(),
  // Its hits, when they are rows another action also uses with other
  // frames (a weak and a Surging Bite share the bite row); else the rows
  // whose timing names this action.
  hits: z
    .array(
      z.object({
        row: z.string(),
        frame: frameSchema,
        category: z.string().optional(),
        element: z.string().optional(),
        gauge: z.number().min(0).optional(),
        icd: z.string().optional(),
        icdGroup: z.string().optional(),
        // Played once per `repeat` count (a spin of a held Charged Attack).
        repeats: z.boolean().optional(),
      })
    )
    .optional(),
  // Held for a count the rotation block sets (Mavuika's Flamestrider
  // Charged Attack: spins before the Final hit): its `repeats` hits play
  // that many times, `everyFrames` apart, and every later hit, its end and
  // its cancels come that much later. `max`: the most the block allows.
  // With `hold`, the block sets how long it is held instead (seconds in the
  // editor, frames here, from `minFrames` to `maxFrames`): its `repeats`
  // hits play from their frame every `hitEveryFrames` up to the release,
  // and the hits after them, its end and its cancels come as much after
  // the release as they do after `releaseFrame`. A block with no hold time
  // is held for its count: `releaseFrame` + (count - 1) × `everyFrames`.
  // `cancelledBy`: the next blocks (action ids or kinds: a Dash) that
  // cancel it at the release: none of the later hits, it ends there, and
  // `<id>/cancel` fires.
  repeat: z
    .object({
      label: z.string(),
      everyFrames: frameSchema.min(1),
      max: z.number().int().min(1),
      hold: z
        .object({
          // The shortest hold before its closing hit (gcsim's minimum; 0:
          // let go at once, the closing hit with no repeated one before).
          minFrames: frameSchema.min(0),
          // The shortest one cancelled at the release (no Final hit: a
          // Dash right after), when that can be shorter (Mavuika's spin,
          // dashed out before its first hit lands). None: `minFrames`.
          cancelMinFrames: frameSchema.min(1).optional(),
          releaseFrame: frameSchema.min(1),
          maxFrames: frameSchema.min(1),
          hitEveryFrames: frameSchema.min(1),
          cancelledBy: z.array(z.string()).optional(),
        })
        .strict()
        .optional(),
    })
    .optional(),
  // Trigger and "uses" key it also counts as (Mualani's bite is Normal
  // Attack DMG: "normal").
  group: actionIdSchema.optional(),
  energyCost: z.number().positive().optional(),
  // The hold of this action ("skill"): no palette item of its own, it is
  // that action's block with Hold on.
  holdOf: actionIdSchema.optional(),
  // What a Dash block plays while this holds (Mavuika's Flamestrider
  // Sprint on the Flamestrider: her dash button is the Sprint there).
  asDodgeWhile: conditionSchema.optional(),
  // A cancel the user can pick for a block of it (its "charge cancel"):
  // between an `after` and an `into` action (Mavuika's Sprint between two
  // spins), the `into` one starts `frames` into it instead of at its
  // cancel. Not while the `after` one was let go mid-spin at a `lockout`
  // frame (from its start: `fromFrame`, for `frames`, every `everyFrames`).
  quickCancel: z
    .object({
      after: actionIdSchema,
      into: actionIdSchema,
      frames: frameSchema.min(1),
      lockout: z
        .object({
          fromFrame: frameSchema.min(0),
          frames: frameSchema.min(1),
          everyFrames: frameSchema.min(1),
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional(),
});

const elementSchema = z.enum([
  'Pyro',
  'Hydro',
  'Electro',
  'Cryo',
  'Anemo',
  'Geo',
  'Dendro',
  'Physical',
]);

// A form an action takes while a condition holds: Varesa's Fiery Passion
// attacks, an E that becomes another skill, Mualani's bites instead of
// Normal Attacks. The rotation keeps asking for the action it `replaces`;
// the first form whose `while` holds as it starts is performed instead.
//
// Its hits are its `hits`, or the rows timed with its id. A form of the
// Normal Attack with rows (and no `hits`) is a whole combo of its own,
// one step per row in order, carrying on the combo position.
export const talentFormSchema = talentActionSchema
  .extend({
    // The action it transforms; defaults to the talent's (Normal Attack
    // talent: "normal").
    replaces: actionIdSchema.optional(),
    while: conditionSchema,
    // Every hit of the form deals this element (an attack transformation).
    element: elementSchema.optional(),
    // Defaults to the replaced action's (a combo takes its rows' ends).
    end: frameSchema.optional(),
    // "shared" (default): the replaced action's cooldown and cooldown id.
    // "none": always ready. Or a cooldown of its own (id: `cooldownId`, or
    // the form's id).
    // "waived": it waits for the replaced action's cooldown like it, but
    // does not start it (Chevreuse's C4: Hold E shots off cooldown).
    cooldown: z
      .union([
        cooldownSchema,
        z.literal('shared'),
        z.literal('none'),
        z.literal('waived'),
      ])
      .default('shared'),
    // Defaults to the replaced action's.
    label: z.string().optional(),
    shortLabel: z.string().optional(),
    // A Normal Attack combo of its own that starts over at its first hit
    // when it takes over, and the plain combo at N1 when it gives way
    // (gcsim's NormalCounter = 0 on entering or leaving the state:
    // Xilonen's roller skates, Mavuika's Flamestrider). Without it the
    // combo position carries on (Varesa's Fiery Passion).
    resetsCombo: z.boolean().optional(),
  })
  .strict();

// Talent-level timing of an E / Q cast.
export const talentTimingShape = {
  // Frame at which the cast ends and the next action can start.
  end: frameSchema.optional(),
  cancels: cancelsSchema.optional(),
  // Burst: Energy needed to cast it.
  energyCost: z.number().positive().optional(),
  cooldown: cooldownSchema.optional(),
  // An E / Q without an animation of its own: cast during the previous
  // action (at its first hit, or as it starts) and takes no time.
  castDuringPrevious: z.boolean().default(false),
  note: z.string().optional(),
  actions: z.array(talentActionSchema).default([]),
  forms: z.array(talentFormSchema).default([]),
};

type RowTiming = z.infer<typeof rowTimingSchema>;
type TalentAction = z.infer<typeof talentActionSchema>;
type TalentForm = z.infer<typeof talentFormSchema>;

export type ActionHitData = {
  frame: number;
  // Full "talentId/rowId" reference.
  row: string;
  element?: string;
  category?: string;
  // Element units it applies (1 when missing).
  gauge?: number;
  // Its elemental application ICD tag (none: it always applies) and group.
  icd?: string;
  icdGroup?: string;
  // Played once per count of a held action (see `repeat`).
  repeats?: boolean;
};

// A held action's count (see the talent action's `repeat`).
export type HoldData = {
  minFrames: number;
  cancelMinFrames?: number;
  releaseFrame: number;
  maxFrames: number;
  hitEveryFrames: number;
  cancelledBy?: string[];
};
export type RepeatData = {
  label: string;
  everyFrames: number;
  max: number;
  hold?: HoldData;
};

type ComboStepData = {
  hits: ActionHitData[];
  end: number;
  cancels?: Record<string, number>;
};

// An action the simulation and the rotation editor work with, derived from
// a talent and its rows.
export type ActionData = {
  kind: RotationActionKind;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  // Category of its hits ("Normal", "Skill", …) for bonuses and results.
  category: string;
  // The cooldown it starts and waits for (shared by an E's press and hold).
  cooldownId: string;
  // Trigger keys it fires besides its own id ("skill" for a hold E).
  group: string;
  combo?: ComboStepData[];
  // A combo form that starts over (and restarts the plain one) when it
  // takes over or gives way (see the form's `resetsCombo`).
  resetsCombo?: boolean;
  hits?: ActionHitData[];
  // Frame at which the action ends (Normal Attacks: per combo step).
  end?: number;
  // Earlier starts for some next actions (Normal Attacks: per combo step).
  cancels?: Record<string, number>;
  cooldown?: CooldownData;
  // A form with a "shared" cooldown: the action whose cooldown it uses.
  sharesCooldownOf?: string;
  energyCost?: number;
  windupSkippedAfterNormal?: number;
  events?: Record<string, number>;
  castDuringPrevious?: boolean;
  // From the character's `actionRules`: skipped (with `message`) unless
  // the condition holds when the action would start.
  requires?: { if: Condition; message: string };
  // Turns into another action while a condition holds (Mualani's Normal
  // Attack is a bite while surfing); the first that holds wins.
  replacements?: { action: string; while: Condition }[];
  // Only reached through another action's `replacement`.
  hidden?: boolean;
  // The action whose block plays this one with Hold on (a hold E).
  holdOf?: string;
  // A Dash block plays this one while it holds (see `asDodgeWhile`).
  asDodgeWhile?: Condition;
  // Its pickable charge cancel (see the schema's `quickCancel`).
  quickCancel?: {
    after: string;
    into: string;
    frames: number;
    lockout?: { fromFrame: number; frames: number; everyFrames: number };
  };
  // Held for a count the block sets (see the talent action's `repeat`).
  repeat?: RepeatData;
};

type TalentWithTiming = {
  id: string;
  kind: 'normal' | 'skill' | 'burst';
  name: string;
  icon: string;
  rows: ({ id: string } & (
    | { type: 'text' }
    | { type: 'multiplier'; timing?: RowTiming }
  ))[];
  end?: number;
  cancels?: Record<string, number>;
  energyCost?: number;
  cooldown?: CooldownData;
  castDuringPrevious?: boolean;
  note?: string;
  actions: TalentAction[];
  forms: TalentForm[];
};

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  normal:
    'Presses in a row. The combo carries on from the last hit until a Dodge, Wait or other action.',
  charged: 'Charged Attack.',
  skill: 'Waits for the cooldown when it is not ready.',
  burst: 'Waits for the cooldown when it is not ready.',
};

const SHORT_LABELS: Record<'skill' | 'burst', string> = {
  skill: 'E',
  burst: 'Q',
};

const CATEGORIES: Partial<Record<RotationActionKind, string>> = {
  normal: 'Normal',
  charged: 'Charged',
  skill: 'Skill',
  burst: 'Burst',
  plunge: 'Plunge',
  move: 'Move',
};

const STANDARD_ACTIONS = ['normal', 'charged', 'skill', 'burst'];

type TimedRow = { id: string; timing: RowTiming };

const getTimedRows = (talent: TalentWithTiming, action: string): TimedRow[] =>
  talent.rows.flatMap((row) =>
    row.type === 'multiplier' && row.timing?.action === action
      ? [{ id: row.id, timing: row.timing }]
      : []
  );

const toHits = (talentId: string, row: TimedRow): ActionHitData[] =>
  row.timing.hitmarks.map((frame) => ({
    frame,
    row: `${talentId}/${row.id}`,
    element: row.timing.element,
    category: row.timing.category,
    gauge: row.timing.gauge,
    icd: row.timing.icd,
    icdGroup: row.timing.icdGroup,
  }));

// The actions every talent defines, keyed by the rotation block id
// ("normal", "charged", "skill", "burst"). Names, short labels and default
// descriptions come from the talent, so the file only holds timing.
//
// The Normal Attack combo is every "normal" row in order. They usually live
// in the Normal Attack talent, but a kit can turn its normals into something
// else (Mualani's bites are rows of her E talent) and name them itself.
export const getCharacterActions = (
  talents: TalentWithTiming[]
): Record<string, ActionData> => {
  const actions: Record<string, ActionData> = {};
  const ordered = [
    ...talents.filter((talent) => talent.kind === 'normal'),
    ...talents.filter((talent) => talent.kind !== 'normal'),
  ];

  const comboRows = ordered.flatMap((talent) =>
    getTimedRows(talent, 'normal').map((row) => ({ talent, row }))
  );
  if (comboRows.length > 0) {
    const [{ talent, row: first }] = comboRows;
    actions.normal = {
      kind: 'normal',
      label: first.timing.label ?? 'Normal Attack',
      shortLabel: first.timing.shortLabel ?? 'N',
      icon: first.timing.icon ?? talent.icon,
      description: first.timing.note ?? DEFAULT_DESCRIPTIONS.normal,
      category: 'Normal',
      cooldownId: 'normal',
      group: 'normal',
      combo: comboRows.map(({ talent: owner, row }) => ({
        hits: toHits(owner.id, row),
        end: row.timing.end ?? 0,
        cancels: row.timing.cancels,
      })),
    };
  }

  for (const talent of ordered) {
    const [charged] = getTimedRows(talent, 'charged');
    if (charged) {
      actions.charged = {
        kind: 'charged',
        label: charged.timing.label ?? 'Charged Attack',
        shortLabel: charged.timing.shortLabel ?? 'CA',
        icon: charged.timing.icon ?? talent.icon,
        description: charged.timing.note ?? DEFAULT_DESCRIPTIONS.charged,
        category: 'Charged',
        cooldownId: 'charged',
        group: 'charged',
        hits: toHits(talent.id, charged),
        end: charged.timing.end,
        cancels: charged.timing.cancels,
        windupSkippedAfterNormal: charged.timing.windupSkippedAfterNormal,
        events: charged.timing.events,
      };
    }
    if (talent.kind === 'normal') {
      continue;
    }
    // An E / Q is castable once it has timing: hits, an end or a cooldown
    // (an E that only changes state, like Mualani's, has no hits).
    const castRows = getTimedRows(talent, talent.kind);
    if (castRows.length === 0 && talent.end === undefined && !talent.cooldown) {
      continue;
    }
    if (talent.end === undefined) {
      throw new Error(
        `The ${talent.kind} of "${talent.id}" needs an "end" frame`
      );
    }
    actions[talent.kind] = {
      kind: talent.kind,
      label: `${talent.name} (${SHORT_LABELS[talent.kind]})`,
      shortLabel: SHORT_LABELS[talent.kind],
      icon: talent.icon,
      description: talent.note ?? DEFAULT_DESCRIPTIONS[talent.kind],
      category: CATEGORIES[talent.kind] ?? talent.kind,
      cooldownId: talent.kind,
      group: talent.kind,
      hits: getCastHits(talent, castRows),
      end: talent.end,
      cancels: talent.cancels,
      cooldown: talent.cooldown,
      energyCost: talent.energyCost,
      castDuringPrevious: talent.castDuringPrevious,
    };
  }

  // Extra actions; their hits may live in any talent.
  for (const talent of ordered) {
    for (const extra of talent.actions) {
      if (actions[extra.id] || STANDARD_ACTIONS.includes(extra.id)) {
        throw new Error(`Two actions use the id "${extra.id}"`);
      }
      actions[extra.id] = toExtraAction(talent, extra, ordered);
    }
  }

  // Forms last: they start from the action they replace.
  for (const talent of ordered) {
    for (const form of talent.forms) {
      if (actions[form.id] || STANDARD_ACTIONS.includes(form.id)) {
        throw new Error(`Two actions use the id "${form.id}"`);
      }
      const replaces =
        form.replaces ?? (talent.kind === 'normal' ? 'normal' : talent.kind);
      const target = actions[replaces];
      if (!target) {
        throw new Error(
          `Form "${form.id}" replaces an unknown action "${replaces}"`
        );
      }
      actions[form.id] = {
        ...toFormAction(form, target, ordered),
        ...(form.cooldown === 'shared' ? { sharesCooldownOf: replaces } : {}),
      };
      target.replacements = [
        ...(target.replacements ?? []),
        { action: form.id, while: form.while },
      ];
    }
  }

  ordered.forEach((talent) =>
    talent.rows.forEach((row) => {
      const action = row.type === 'multiplier' ? row.timing?.action : null;
      if (action && !STANDARD_ACTIONS.includes(action) && !actions[action]) {
        throw new Error(
          `Row "${talent.id}/${row.id}" is timed for an unknown action "${action}"`
        );
      }
    })
  );
  return actions;
};

const getCastHits = (
  talent: TalentWithTiming,
  rows: TimedRow[]
): ActionHitData[] =>
  rows
    .flatMap((row) => toHits(talent.id, row))
    .sort((first, second) => first.frame - second.frame);

const toExtraAction = (
  talent: TalentWithTiming,
  extra: TalentAction,
  talents: TalentWithTiming[]
): ActionData => {
  const kind: RotationActionKind =
    extra.kind ?? (talent.kind === 'normal' ? 'plunge' : talent.kind);
  // A variant of the E / Q itself (a hold E) shares its cooldown and
  // triggers; anything else the talent allows (surfing into an enemy) is
  // its own action.
  const isVariant = talent.kind !== 'normal' && kind === talent.kind;
  return {
    kind,
    label: extra.label,
    shortLabel: extra.shortLabel,
    icon: extra.icon ?? talent.icon,
    description: extra.note ?? '',
    category: CATEGORIES[kind] ?? kind,
    cooldownId: extra.cooldownId ?? (isVariant ? talent.kind : extra.id),
    group: extra.group ?? (isVariant ? talent.kind : extra.id),
    hits: (
      extra.hits ??
      talents.flatMap((owner) =>
        getTimedRows(owner, extra.id).flatMap((row) => toHits(owner.id, row))
      )
    ).sort((first, second) => first.frame - second.frame),
    end: extra.end,
    cancels: extra.cancels,
    cooldown: extra.cooldown,
    energyCost: extra.energyCost,
    holdOf: extra.holdOf,
    repeat: extra.repeat,
    asDodgeWhile: extra.asDodgeWhile,
    quickCancel: extra.quickCancel,
  };
};

const toFormAction = (
  form: TalentForm,
  target: ActionData,
  talents: TalentWithTiming[]
): ActionData => {
  const withElement = (hit: ActionHitData): ActionHitData =>
    form.element ? { ...hit, element: form.element } : hit;
  const rows = talents.flatMap((owner) =>
    getTimedRows(owner, form.id).map((row) => ({ owner, row }))
  );
  const isCombo = target.kind === 'normal' && !form.hits && rows.length > 0;
  const combo = isCombo
    ? rows.map(({ owner, row }) => {
        if (row.timing.end === undefined) {
          throw new Error(
            `Row "${owner.id}/${row.id}" of form "${form.id}" needs an "end"`
          );
        }
        return {
          hits: toHits(owner.id, row).map(withElement),
          end: row.timing.end,
          cancels: row.timing.cancels,
        };
      })
    : undefined;
  // Without an end of its own it has the replaced action's animation, so
  // also its cancels and whether it is cast during the previous action.
  const sameAnimation = form.end === undefined;
  const end = form.end ?? target.end;
  if (!isCombo && end === undefined) {
    throw new Error(`Form "${form.id}" needs an "end" frame`);
  }
  const ownCooldown = typeof form.cooldown === 'object';
  return {
    kind: form.kind ?? target.kind,
    label: form.label ?? target.label,
    shortLabel: form.shortLabel ?? target.shortLabel,
    icon: form.icon ?? target.icon,
    description: form.note ?? target.description,
    category: target.category,
    cooldownId:
      form.cooldown === 'shared' || form.cooldown === 'waived'
        ? target.cooldownId
        : form.cooldownId ?? form.id,
    cooldown:
      form.cooldown === 'shared'
        ? target.cooldown
        : ownCooldown
        ? (form.cooldown as CooldownData)
        : undefined,
    // It still counts (and triggers) as the action it replaces.
    group: form.group ?? target.group,
    combo,
    ...(form.resetsCombo ? { resetsCombo: true } : {}),
    hits: isCombo
      ? undefined
      : (form.hits ?? rows.flatMap(({ owner, row }) => toHits(owner.id, row)))
          .map(withElement)
          .sort((first, second) => first.frame - second.frame),
    end: isCombo ? undefined : end,
    cancels: isCombo
      ? undefined
      : form.cancels ?? (sameAnimation ? target.cancels : undefined),
    castDuringPrevious:
      !isCombo && sameAnimation ? target.castDuringPrevious : undefined,
    energyCost: form.energyCost ?? target.energyCost,
    repeat: form.repeat ?? (sameAnimation ? target.repeat : undefined),
    hidden: true,
  };
};

// A block's count for a held action: its own `repeat`, or the largest of
// the forms it turns into (the Charged Attack is a Flamestrider spin).
const repeatOf = (
  id: string,
  actions: Record<string, ActionData>
): {
  count?: {
    label: string;
    max: number;
    hold?: {
      minFrames: number;
      cancelMinFrames?: number;
      maxFrames: number;
      releaseFrame: number;
      everyFrames: number;
      firstHitFrame: number;
      closingAfterFrames?: number;
      hitEveryFrames: number;
      cancelledBy?: string[];
    };
  };
} => {
  const repeats = [id, ...(actions[id].replacements ?? []).map((r) => r.action)]
    .map((actionId) => actions[actionId]?.repeat)
    .filter((repeat): repeat is RepeatData => Boolean(repeat));
  if (repeats.length === 0) {
    return {};
  }
  const widest = repeats.reduce((most, repeat) =>
    repeat.max > most.max ? repeat : most
  );
  // The repeated hit's frame, for the hold's charges.
  const holder = [id, ...(actions[id].replacements ?? []).map((r) => r.action)]
    .map((actionId) => actions[actionId])
    .find((action) => action?.repeat === widest);
  const firstHitFrame =
    holder?.hits?.find((hit) => hit.repeats)?.frame ?? widest.everyFrames;
  // Its closing hit (the Final): how long after the release it lands.
  const closing = widest.hold
    ? holder?.hits?.find(
        (hit) => !hit.repeats && hit.frame > (widest.hold?.releaseFrame ?? 0)
      )
    : undefined;
  return {
    count: {
      label: widest.label,
      max: widest.max,
      ...(widest.hold
        ? {
            hold: {
              minFrames: widest.hold.minFrames,
              ...(widest.hold.cancelMinFrames
                ? { cancelMinFrames: widest.hold.cancelMinFrames }
                : {}),
              maxFrames: widest.hold.maxFrames,
              releaseFrame: widest.hold.releaseFrame,
              everyFrames: widest.everyFrames,
              firstHitFrame,
              ...(closing && widest.hold
                ? {
                    closingAfterFrames:
                      closing.frame - widest.hold.releaseFrame,
                  }
                : {}),
              hitEveryFrames: widest.hold.hitEveryFrames,
              ...(widest.hold.cancelledBy
                ? { cancelledBy: widest.hold.cancelledBy }
                : {}),
            },
          }
        : {}),
    },
  };
};

// The rotation editor's palette comes straight from the actions.
export const toRotationActions = (
  actions: Record<string, ActionData>
): RotationAction[] =>
  Object.entries(actions).map(([id, action]) => {
    const hold = Object.entries(actions).find(
      ([, other]) => other.holdOf === id
    )?.[0];
    return {
      id,
      kind: action.kind,
      label: action.label,
      shortLabel: action.shortLabel,
      icon: action.icon,
      description: action.description,
      maxHits: action.combo?.length,
      ...repeatOf(id, actions),
      // A hold is played from its action's block.
      hidden: action.hidden || Boolean(action.holdOf),
      ...(hold ? { hold } : {}),
    };
  });
