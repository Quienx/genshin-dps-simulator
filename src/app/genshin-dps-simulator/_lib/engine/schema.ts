import { z } from 'zod';

import { TRANSFORMATIVE_REACTIONS } from '../reactions';

// Where a block comes from. It never changes how the engine treats it; it
// is for grouping (UI, activity log) and for toggling sources on and off.
export const blockSourceSchema = z.enum([
  'talent',
  'passive',
  'constellation',
  'weapon',
  'artifact',
  'system',
]);

// A numeric condition on a state value (a resource, a status or a stack
// count, by id): all given bounds must hold.
export const stateConditionSchema = z.object({
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
});

export const frames = z.number().int().min(0);
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

// ---------------------------------------------------------------- conditions

export type Condition =
  | ({ resource: string } & z.infer<typeof stateConditionSchema>)
  // Active now, or (for the planner) at a named event of the action being
  // considered, e.g. "absorb" of a Charged Attack. With bounds, its value
  // must meet them instead: a stack status' count (Nefer's 3 Veils), 0 or 1
  // for the others.
  | ({ status: string; atEvent?: string } & z.infer<
      typeof stateConditionSchema
    >)
  | { flag: string }
  // A number form field (e.g. party members), by name.
  | ({ field: string } & z.infer<typeof stateConditionSchema>)
  | { ready: string }
  // The action just before the one being planned, by id, group or kind
  // ("charged": a plunge only right after a Charged Attack). Only the
  // rotation planner knows it; elsewhere it never holds.
  | { previous: string }
  // On the field (a character alone always is).
  | { onField: true }
  // How many party members are of these elements: at least `gte` (1 when
  // missing), or every member with `everyone`. Alone, the party is the
  // character.
  | { partyElements: string[]; gte?: number; everyone?: true }
  // The party's Moonsign (each Moonsign member adds 1): "nascent" with one,
  // "ascendant" with two or more.
  | { moonsign: 'nascent' | 'ascendant' }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { hook: string };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ resource: z.string() }).merge(stateConditionSchema).strict(),
    z
      .object({ status: z.string(), atEvent: z.string().optional() })
      .merge(stateConditionSchema)
      .strict(),
    z.object({ flag: z.string() }).strict(),
    z.object({ field: z.string() }).merge(stateConditionSchema).strict(),
    z.object({ ready: z.string() }).strict(),
    z.object({ previous: z.string() }).strict(),
    z.object({ onField: z.literal(true) }).strict(),
    z
      .object({
        partyElements: z.array(z.string()).min(1),
        gte: z.number().int().min(0).optional(),
        everyone: z.literal(true).optional(),
      })
      .strict(),
    z.object({ moonsign: z.enum(['nascent', 'ascendant']) }).strict(),
    z.object({ all: z.array(conditionSchema) }).strict(),
    z.object({ any: z.array(conditionSchema) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    z.object({ hook: z.string() }).strict(),
  ])
);

// ---------------------------------------------------------------- operations

// How much: a number, one of two numbers depending on a status, a talent
// row's value at the character's talent level, a number form field, a
// resource's current value, a stack status' count, or (in a
// `resourceChanges` trigger) how much the resource moved, as a positive
// number. `times` scales the last two
// (Mavuika's Fighting Spirit: the Nightsoul points she spent, × 0.25 more at
// C1).
const amountSchema = z.union([
  z.number(),
  z.object({ ifStatus: z.string(), then: z.number(), else: z.number() }),
  z.object({ row: z.string() }),
  z.object({ field: z.string() }),
  z.object({ resource: z.string(), times: z.number().optional() }).strict(),
  z.object({ changed: z.literal(true), times: z.number().optional() }).strict(),
  // A stack status' count now (Nefer's Veils, kept when her Q spends them).
  z.object({ stacks: z.string(), times: z.number().optional() }).strict(),
]);

// Every operation can be limited to a flag, a condition and an ICD of its own,
// and delayed: with `delayFrames` the op runs that much later, and its
// guards are checked then (e.g. a Puffer picked up 20 frames after a bite
// only counts while the Blessing still lasts).
const opGuardShape = {
  ifFlag: z.string().optional(),
  unlessFlag: z.string().optional(),
  if: conditionSchema.optional(),
  icdFrames: frames.optional(),
  delayFrames: frames.optional(),
};

export const opSchema = z.union([
  z
    .object({
      addResource: z.string(),
      amount: amountSchema,
      // Spends from another resource's room while a status lasts (e.g. at
      // most 145% Bond of Life from Directives per E).
      budget: z
        .object({ resource: z.string(), whileStatus: z.string() })
        .optional(),
      ...opGuardShape,
    })
    .strict(),
  z
    .object({ multiplyResource: z.string(), by: z.number(), ...opGuardShape })
    .strict(),
  z
    .object({ setResource: z.string(), value: amountSchema, ...opGuardShape })
    .strict(),
  z
    .object({
      applyStatus: z.string(),
      // Applied later; dropped if the status that scheduled it is gone.
      afterFrames: frames.optional(),
      ...opGuardShape,
    })
    .strict(),
  z.object({ removeStatus: z.string(), ...opGuardShape }).strict(),
  // Lengthens the status that is up now (nothing when it is down).
  z.object({ extendStatus: z.string(), frames, ...opGuardShape }).strict(),
  // `times`: several stacks at once (Nefer absorbing every Seed of Deceit).
  z
    .object({
      addStack: z.string(),
      times: amountSchema.optional(),
      ...opGuardShape,
    })
    .strict(),
  z
    .object({
      // Cuts only what is left of the cooldown.
      reduceCooldown: z.string(),
      frames,
      ...opGuardShape,
    })
    .strict(),
  z
    .object({
      // How much: `multiplier` (% of the scaling stat) or a talent `row`.
      hit: z
        .object({
          multiplier: z.number().optional(),
          row: z.string().optional(),
          // The multiplier a number form field holds.
          multiplierField: z.string().optional(),
          // "attacker": the element of the member whose hit fired it.
          element: z.union([elementSchema, z.literal('attacker')]),
          // Element units it applies to the enemy (1 when missing).
          gauge: z.number().min(0).optional(),
          // Its elemental application ICD tag and group (see the talents'
          // rows).
          icd: z.string().optional(),
          icdGroup: z.string().optional(),
          // Dealt by the member whose hit fired the trigger (a `party:` or
          // `active:` one), with that member's stats: Nicole's Arcane
          // Projections. Alone, the character itself deals it.
          asAttacker: z.boolean().optional(),
          category: z.string(),
          afterFrames: frames.optional(),
        })
        .refine(
          (hit) =>
            [hit.multiplier !== undefined, hit.row, hit.multiplierField].filter(
              Boolean
            ).length === 1,
          {
            message:
              'A hit needs one of "multiplier", "row" or "multiplierField"',
          }
        ),
      ...opGuardShape,
    })
    .strict(),
  z
    .object({
      // A transformative reaction's own hit (Overloaded), with the
      // character's EM. There is no aura model: the kit decides when it
      // happens (a hit trigger with an ICD).
      reactionHit: z.enum(TRANSFORMATIVE_REACTIONS as [string, ...string[]]),
      afterFrames: frames.optional(),
      ...opGuardShape,
    })
    .strict(),
  z
    .object({
      // Elemental particles caught (needs the "energy" system): a count, or
      // `min` with a `maxChance` of getting `max` instead (expected-damage
      // runs use the average).
      particles: z.union([
        z.number().positive(),
        z
          .object({
            min: z.number().min(0),
            max: z.number().positive(),
            maxChance: z.number().min(0).max(1),
          })
          .strict(),
      ]),
      // Particles fly for a while before they are caught.
      afterFrames: frames.optional(),
      // Elementless (clear) particles, 2 Energy each (Favonius).
      clear: z.boolean().optional(),
      ...opGuardShape,
    })
    .strict(),
  z
    .object({
      count: z.string(),
      // Adds what the trigger's previous `addResource` gained instead of 1.
      by: z.literal('gained').optional(),
      ...opGuardShape,
    })
    .strict(),
  // Text for the current action's trace entry; {gained} and
  // {secondsUntil:<status>} are filled in.
  z.object({ note: z.string(), ...opGuardShape }).strict(),
  // A heal: HP is not simulated, but it happens (the inspector shows it)
  // and fires `heal` triggers (Chevreuse's C6 stacks). `from`: what heals,
  // when it is not the block's own source (a talent's E or Q…).
  z
    .object({
      heal: z
        .object({
          effect: z.string(),
          // The amount in a few characters, for the block ("5.33% HP + 657").
          short: z.string().optional(),
          target: z.enum(['active', 'party']).default('active'),
          from: z
            .enum([
              'normal',
              'charged',
              'plunge',
              'skill',
              'burst',
              'passive',
              'constellation',
              'weapon',
              'artifact',
            ])
            .optional(),
        })
        .strict(),
      ...opGuardShape,
    })
    .strict(),
  z.object({ warn: z.string(), ...opGuardShape }).strict(),
  // Starts an action's cooldown now, for cooldowns marked `deferred` (the
  // E's starts when Nightsoul's Blessing ends).
  z.object({ startCooldown: z.string(), ...opGuardShape }).strict(),
  z.object({ hook: z.string(), ...opGuardShape }).strict(),
]);

// ---------------------------------------------------------------- blocks

const blockBaseShape = {
  id: z.string(),
  source: blockSourceSchema,
  label: z.string(),
  // UI toggle: the block only exists while this flag is on.
  ifFlag: z.string().optional(),
  // Project Amber UI asset name for the activity timeline. Without it the
  // icon comes from the constellation, passive, weapon or set it belongs to.
  icon: z.string().optional(),
};

const hitMatchSchema = z.object({
  // Action ids ("normal", "charged", "skill", "burst").
  actions: z.array(z.string()).optional(),
  // Talent rows ("elementalSkill/frostfall"): status ticks too.
  rows: z.array(z.string()).optional(),
  // The weapon types of whoever deals the hit (Bennett's C6 infuses
  // Swords, Claymores and Polearms).
  weaponTypes: z.array(z.string()).optional(),
  elements: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
});

// What a stat bonus changes. Units: % for dmgBonus, critRate, critDamage,
// the *Percent stats (of the base stat), defReduction, defIgnore and resShred
// (RES points); flat numbers for flatAtk, flatHp, flatDef, elementalMastery
// and flatDamage (added to the hit's base DMG); flatMultiplier is talent %
// of the scaling stat. Negative values are debuffs.
// Lunar DMG (hits of a Lunar category, `_data/reactions.json`):
// lunarBonus is gcsim's reaction bonus ("Lunar-Bloom DMG +x%"),
// lunarBaseBonus its BaseDmgBonus ("Base DMG +x%", added together) and
// elevation its Elevation (a final × (1 + x%)). multiplierBonus scales the
// hit's talent multiplier and flat DMG (× (1 + x%)), any hit: Nefer's Veil.
//
// The stat fields the user fills in are the character screen's totals, so
// these are only for bonuses that screen does not show (conditional buffs).
export const BONUS_STATS = [
  'dmgBonus',
  'critRate',
  'critDamage',
  'flatMultiplier',
  'atkPercent',
  'hpPercent',
  'defPercent',
  'flatAtk',
  'flatHp',
  'flatDef',
  'elementalMastery',
  'flatDamage',
  'defReduction',
  'defIgnore',
  'resShred',
  'lunarBonus',
  'lunarBaseBonus',
  'elevation',
  'multiplierBonus',
] as const;

export const sheetStatSchema = z.enum(['atk', 'hp', 'def', 'em']);
// What a bonus can convert (`ofStat`): a screen stat, or Base ATK (the
// character's and the weapon's: Bennett's Q).
export const ofStatSchema = z.enum(['atk', 'hp', 'def', 'em', 'baseAtk']);

const perStackSchema = z.object({ state: z.string(), max: z.number() });

// A number, or one of two depending on a UI flag (a constellation).
export const flagNumberSchema = z.union([
  z.number(),
  z.object({ flag: z.string(), then: z.number(), else: z.number() }).strict(),
]);

// Changes the hits it matches while its conditions hold: a stat, the
// element (infusion) or an extra multiplier that scales with a resource.
export const bonusBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('bonus'),
    stat: z.enum(BONUS_STATS).optional(),
    // One value, or one per refinement / level picked by `scaleBy`.
    value: z.union([z.number(), z.array(z.number()).min(1)]).optional(),
    // By a number field (refinement, level), by how many party members
    // are of these elements (Escoffier's A4: 1, 2, 3 or 4 Hydro/Cryo), or by
    // the party's Moonsign (Nascent, Ascendant Gleam; none without one).
    scaleBy: z
      .union([
        z.object({ field: z.string() }).strict(),
        z.object({ partyElements: z.array(z.string()).min(1) }).strict(),
        z.object({ moonsign: z.literal(true) }).strict(),
      ])
      .optional(),
    // `value` is a % of this stat's total at the moment of the hit (after
    // the other bonuses, but not other `ofStat` ones): flat DMG equal to 60%
    // of DEF, or 1% ATK per 1,000 Max HP (0.1).
    ofStat: ofStatSchema.optional(),
    // Multiplied by a state value (e.g. set stacks), capped at `max`; with
    // several, by each of them (Mavuika's A4: Fighting Spirit spent × the
    // stacks left).
    perStack: z
      .union([perStackSchema, z.array(perStackSchema).min(1)])
      .transform((perStack) =>
        Array.isArray(perStack) ? perStack : [perStack]
      )
      .optional(),
    // The most it ever gives, after `ofStat` and `perStack` (in the stat's
    // unit: "flat DMG up to 20000").
    cap: z.number().optional(),
    // `value` / `cap` read from a talent row ("talentId/rowId") at the
    // character's talent level (a buff that grows with the E's level).
    valueRow: z.string().optional(),
    capRow: z.string().optional(),
    // `value` read from a number form field (a teammate's buff).
    valueField: z.string().optional(),
    infuse: elementSchema.optional(),
    // An amplifying reaction the hits trigger ("Vaporize", "Melt").
    reaction: z.string().optional(),
    // Renames the hits' category (a bite at 3 Wave Momentum is a "Surging
    // Bite"); applied before every other bonus is matched.
    setCategory: z.string().optional(),
    addMultiplier: z
      .object({
        row: z.string(),
        // row value × resource / per
        perResource: z.string(),
        per: z.number().positive(),
      })
      .optional(),
    // Which hits it applies to; every hit when missing.
    match: hitMatchSchema.optional(),
    // State values that must hold at the moment of the hit.
    while: z.record(stateConditionSchema).optional(),
    // Any condition that must hold then, as a trigger's `if` (e.g. off the
    // field: `{ "not": { "onField": true } }`). A team buff checks it on
    // the giver.
    if: conditionSchema.optional(),
    // "Extra" (gcsim): buffs that convert a stat (`ofStat`, like Iansan's
    // Scale from her ATK) never count it, so they do not feed each other.
    extra: z.boolean().optional(),
    // A buff for the rest of the party: it never applies to the
    // character's own hits; in a team it applies to the other members'
    // ("active": only to the one on the field). The details report it
    // ({buffValue:<id>}).
    // "everyone": the party's hits and the character's own (one block for
    // a self + party buff).
    teamBuff: z
      .union([z.boolean(), z.literal('active'), z.literal('everyone')])
      .optional(),
  })
  .refine(
    (block) =>
      [
        block.stat !== undefined,
        block.infuse,
        block.addMultiplier,
        block.reaction,
        block.setCategory,
      ].filter(Boolean).length === 1,
    {
      message:
        'A bonus has exactly one of "stat", "infuse", "addMultiplier", "reaction", "setCategory"',
    }
  )
  .refine(
    (block) =>
      block.stat === undefined ||
      [
        block.value !== undefined,
        block.valueRow !== undefined,
        block.valueField !== undefined,
      ].filter(Boolean).length === 1,
    {
      message: 'A stat bonus needs one of "value", "valueRow" or "valueField"',
    }
  )
  .refine((block) => block.ofStat === undefined || block.stat !== undefined, {
    message: '"ofStat" needs a "stat"',
  });

export const resourceBlockSchema = z.object({
  ...blockBaseShape,
  type: z.literal('resource'),
  min: z.number().default(0),
  // A number, or one by a flag (Mavuika's C1: 120 Nightsoul points).
  max: flagNumberSchema,
  // Starting value: a number, or a form field (clamped to min/max).
  initial: z.union([z.number(), z.object({ field: z.string() })]).default(0),
  // The party's: one value every member declaring it shares (Verdant Dew).
  // Alone, the character's own.
  shared: z.boolean().optional(),
  // Shown in each hit's notes ("Bond of Life: 130.0%").
  noteFormat: z.enum(['percent']).optional(),
  // How its value reads in the activity timeline; defaults to noteFormat.
  unit: z.enum(['percent']).optional(),
});

export const statusBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('status'),
    target: z.enum(['self', 'enemy']).default('self'),
    // Missing: lasts until removed (or until `endsWith` ends).
    durationFrames: frames.optional(),
    // Removed together with this other status.
    endsWith: z.string().optional(),
    // Periodic hits while the status lasts.
    ticks: z
      .object({
        // May be fractional (58.5): tick n lands ceil(everyFrames × n)
        // after the first, as gcsim rounds it.
        everyFrames: z.number().positive(),
        // The first tick, from the start (everyFrames when missing).
        firstAfterFrames: frames.optional(),
        count: z.number().int().min(1),
        row: z.string(),
        element: elementSchema,
        category: z.string(),
        // Element units each tick applies (1 when missing), and its ICD.
        gauge: z.number().min(0).optional(),
        icd: z.string().optional(),
        icdGroup: z.string().optional(),
      })
      .optional(),
    // A stack status: each stack lasts on its own; the value is the count.
    stacks: z
      .object({
        max: z.number().int().min(1),
        durationFrames: frames,
        // "active": each stack belongs to the member on the field when it
        // is added, and a bonus reading it counts only the stacks of the
        // character it applies to (Chevreuse's C6 heals). "self": every
        // stack counts for everyone.
        holder: z.enum(['self', 'active']).default('self'),
      })
      .optional(),
    // Spends a resource while it lasts, and ends (after that frame) when the
    // resource is empty: Nightsoul's Blessing and its Nightsoul points.
    drain: z
      .object({
        resource: z.string(),
        amount: z.number().positive().default(1),
        everyFrames: frames.min(1),
        // Defaults to `everyFrames`.
        firstAfterFrames: frames.optional(),
        // A tick spends nothing while this does not hold (it keeps
        // ticking): no Nightsoul drain during Mavuika's Q.
        if: conditionSchema.optional(),
      })
      .optional(),
    // Fills a resource while it lasts, as `drain` spends one (Columbina's
    // Gravity: 0.5 every 3 frames). It never ends the status, and a refresh
    // keeps its rhythm (gcsim's gravityAccum).
    gain: z
      .object({
        resource: z.string(),
        amount: z.number().positive(),
        everyFrames: frames.min(1),
        firstAfterFrames: frames.optional(),
        if: conditionSchema.optional(),
      })
      .optional(),
  })
  .refine(
    (block) =>
      !block.stacks ||
      (block.durationFrames === undefined &&
        !block.ticks &&
        !block.drain &&
        !block.gain &&
        !block.endsWith),
    {
      message:
        'A stack status times each stack on its own: it takes no "durationFrames", "ticks", "drain", "gain" or "endsWith"',
    }
  );

const whenSchema = z.union([
  // After a hit of an action ("normal"), its group ("skill" for a hold E),
  // a talent row ("elementalSkill/skill-cleave"), a category
  // ("category:Plunge"), an element ("element:Hydro"), any non-Physical
  // hit ("elemental", or of a category: "category:Normal:elemental") or any
  // hit ("*"). "crit:<key>" fires only on a CRIT
  // (expected-damage runs: always, with counts and particles × CRIT Rate);
  // "reaction:Overloaded" on a transformative reaction's hit.
  z.object({ hit: z.string() }).strict(),
  z.object({ use: z.string() }).strict(),
  // A named moment of an action, "charged/absorb".
  z.object({ event: z.string() }).strict(),
  // When a resource changes; with `change`, only when it goes that way
  // (Obsidian Codex: on consuming Nightsoul points). `party:<id>`: any
  // member's resource with that id; `active:<id>`: the member on the field's.
  z
    .object({
      resourceChanges: z.string(),
      change: z.enum(['increase', 'decrease']).optional(),
    })
    .strict(),
  // When a status ends: removed, drained or expired.
  z.object({ statusEnds: z.string() }).strict(),
  // When a status is applied (or refreshed). A shield is the status
  // "shield" by convention: Starcaller's Watch reacts to it.
  z.object({ statusStarts: z.string() }).strict(),
  // When the character comes on the field ("in") or leaves it ("out"),
  // in a team.
  z.object({ swap: z.enum(['in', 'out']) }).strict(),
  // After a heal op of this trigger (its id), or of any ("*").
  z.object({ heal: z.string() }).strict(),
]);

export const triggerBlockSchema = z.object({
  ...blockBaseShape,
  type: z.literal('trigger'),
  when: whenSchema,
  if: conditionSchema.optional(),
  icdFrames: frames.optional(),
  do: z.array(opSchema).min(1),
});

export const blockSchema = z.union([
  bonusBlockSchema,
  resourceBlockSchema,
  statusBlockSchema,
  triggerBlockSchema,
]);

// ---------------------------------------------------------------- kit

// The automatic rotation: the first entry whose conditions hold is used.
export const automaticEntrySchema = z.object({
  use: z.string(),
  if: conditionSchema.optional(),
  ifFlag: z.string().optional(),
  unlessFlag: z.string().optional(),
});

// A row of the results details panel. `value` is a template over counters
// ({uses:skill}, {hits:Normal:Pyro}, {count:x}, {resource:bondOfLife},
// {cooldownCut:skill}, {bonusHits:<id>}, {bonusStacks:<id>}, {hits},
// {buffValue:<team buff id>}, {uptime:<status id>}) with an optional format
// (|number, |fixed1, |seconds, |percent of the run) and a/b ratios.
export const detailSchema = z.object({ label: z.string(), value: z.string() });

// A warning shown on an action when a condition does not hold as it starts.
export const actionWarningSchema = z.object({
  action: z.string(),
  unless: conditionSchema,
  message: z.string(),
});

export type BonusStat = (typeof BONUS_STATS)[number];
export type SheetStat = z.infer<typeof sheetStatSchema>;
export type OfStat = z.infer<typeof ofStatSchema>;
export type BlockSource = z.infer<typeof blockSourceSchema>;
export type BonusBlock = z.infer<typeof bonusBlockSchema>;
export type ResourceBlock = z.infer<typeof resourceBlockSchema>;
export type StatusBlock = z.infer<typeof statusBlockSchema>;
export type TriggerBlock = z.infer<typeof triggerBlockSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Op = z.infer<typeof opSchema>;
export type Amount = z.infer<typeof amountSchema>;
export type FlagNumber = z.infer<typeof flagNumberSchema>;
export type PerStack = z.infer<typeof perStackSchema>;
export type AutomaticEntry = z.infer<typeof automaticEntrySchema>;
export type DetailData = z.infer<typeof detailSchema>;
export type ActionWarning = z.infer<typeof actionWarningSchema>;
