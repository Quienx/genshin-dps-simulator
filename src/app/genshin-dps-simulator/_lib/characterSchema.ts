import { z } from 'zod';

import {
  cooldownSchema,
  rowTimingSchema,
  talentTimingShape,
} from './actionSchema';
import {
  actionWarningSchema,
  automaticEntrySchema,
  blockSchema,
  conditionSchema,
  detailSchema,
} from './engine/schema';
import { rotationActionSchema } from './rotation/rotationSchema';

// Stats the character screen shows, which artifacts, ascension and
// always-on passives add to (see `_lib/artifacts.ts`). `elementalDmg` is
// the character's own element.
export const SCREEN_STATS = [
  'flatHp',
  'flatAtk',
  'flatDef',
  'hpPercent',
  'atkPercent',
  'defPercent',
  'elementalMastery',
  'energyRecharge',
  'critRate',
  'critDamage',
  'elementalDmg',
] as const;
export const screenStatSchema = z.enum(SCREEN_STATS);
export type ScreenStat = (typeof SCREEN_STATS)[number];

const fieldSectionSchema = z.enum([
  'stats',
  'talents',
  'passives',
  'weapon',
  'artifacts',
  'rotation',
  'enemy',
  'normalOnly',
]);

const fieldSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('number'),
    section: fieldSectionSchema,
    name: z.string(),
    label: z.string(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }),
  z.object({
    kind: z.literal('checkbox'),
    section: fieldSectionSchema,
    name: z.string(),
    label: z.string(),
  }),
]);

const multiplierComponentSchema = z.object({
  stat: z.enum(['atk', 'hp', 'def', 'em', 'flat']),
  values: z.array(z.number()).min(10),
});

const multiplierRowSchema = z.object({
  type: z.literal('multiplier'),
  id: z.string(),
  label: z.string(),
  components: z.array(multiplierComponentSchema).min(1),
  hits: z.number().int().min(1).optional(),
  suffix: z.string().optional(),
  note: z.string().optional(),
  modifiers: z
    .array(z.object({ whenFlag: z.string(), add: z.number() }))
    .optional(),
  timing: rowTimingSchema.optional(),
});

const textRowSchema = z.object({
  type: z.literal('text'),
  id: z.string(),
  label: z.string(),
  value: z.string(),
  note: z.string().optional(),
});

const talentSchema = z.object({
  id: z.string(),
  kind: z.enum(['normal', 'skill', 'burst']),
  name: z.string(),
  // The in-game text, word for word (the inspector shows it).
  description: z.string().optional(),
  icon: z.string(),
  levelField: z.string(),
  boostedBy: z.string().nullable(),
  statusNote: z.string().optional(),
  // Timing of what this talent does in combat (see actionSchema).
  ...talentTimingShape,
  rows: z
    .array(z.discriminatedUnion('type', [multiplierRowSchema, textRowSchema]))
    .min(1)
    .superRefine((rows, issues) => {
      rows.forEach((row, index) => {
        if (row.type !== 'multiplier') {
          return;
        }
        const { timing } = row;
        if (!timing || !['normal', 'charged'].includes(timing.action)) {
          return;
        }
        if (timing.hitmarks.length !== (row.hits ?? 1)) {
          issues.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'timing', 'hitmarks'],
            message: 'A Normal / Charged row needs one hitmark per hit',
          });
        }
        if (timing.end === undefined) {
          issues.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'timing', 'end'],
            message: 'A Normal / Charged row needs an "end" frame',
          });
        }
      });
    }),
});

const passiveSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  value: z.string(),
  note: z.string().optional(),
  toggleFlag: z.string().optional(),
  // The in-game text, word for word (the inspector shows it).
  description: z.string().optional(),
});

const constellationSchema = z.object({
  id: z.string(),
  level: z.number().int().min(1).max(6),
  name: z.string(),
  icon: z.string(),
  effect: z.string(),
  // The in-game text, word for word (the inspector shows it).
  description: z.string().optional(),
  impact: z.enum(['simulated', 'partial', 'none', 'not-simulated']),
  note: z.string(),
});

// What the build card shows for the artifact set: one row per bonus, with
// the flag that toggles it (rows without a flag are always active). The
// numbers the kit's code needs live in `params`.
const artifactSetSchema = z.object({
  name: z.string(),
  pieces: z.array(
    z.object({ id: z.string(), label: z.string(), icon: z.string() })
  ),
  rows: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
      flag: z.string().optional(),
      note: z.string().optional(),
    })
  ),
  params: z.record(z.number()).default({}),
  // The 2-piece's stats that show on the character screen (Harmonic
  // Whimsy's ATK +18%): added when stats come from artifacts.
  screenStats: z
    .array(z.object({ stat: screenStatSchema, value: z.number() }))
    .default([]),
  // The set's bonuses (source "artifact").
  blocks: z.array(blockSchema).default([]),
});

const weaponRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['included', 'toggle']),
  template: z.string(),
  params: z.record(z.array(z.number()).min(1)).optional(),
  note: z.string().optional(),
  // An always-on passive that shows on the character screen: the stat and
  // the `params` entry with its value per refinement.
  screenStat: z
    .object({ stat: screenStatSchema, param: z.string() })
    .optional(),
});

const weaponSchema = z.object({
  name: z.string(),
  icon: z.string(),
  type: z.string(),
  rarity: z.number().int(),
  level: z.number().int(),
  enabledFlag: z.string(),
  refinementField: z.string(),
  baseAtk: z.number(),
  substat: z.object({
    stat: z.enum([
      'critRate',
      'critDamage',
      'atkPercent',
      'hpPercent',
      'energyRecharge',
      'elementalMastery',
    ]),
    value: z.number(),
  }),
  rows: z.array(weaponRowSchema),
  // The passive's in-game name and text at each refinement (R1-R5).
  passive: z
    .object({ name: z.string(), descriptions: z.array(z.string()).min(1) })
    .optional(),
  // The weapon's bonuses (source "weapon").
  blocks: z.array(blockSchema).default([]),
  // Numbers a kit's own code reads (kits not yet written as blocks).
  mechanics: z.record(z.number()).default({}),
});

export const DAMAGE_ELEMENTS = [
  'Pyro',
  'Hydro',
  'Electro',
  'Cryo',
  'Anemo',
  'Geo',
  'Dendro',
  'Physical',
] as const;

// Every character file follows this one schema.
export const characterSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  element: z.enum(DAMAGE_ELEMENTS).exclude(['Physical']),
  weaponType: z.string(),
  rarity: z.number().int(),
  scalingStat: z.enum(['atk', 'hp', 'def']),
  // Level 90 base stats, without the weapon: what ATK%, HP% and DEF%
  // bonuses multiply (the weapon's base ATK is added to `atk`).
  baseStats: z.object({
    hp: z.number().positive(),
    atk: z.number().positive(),
    def: z.number().positive(),
  }),
  // The level 90 ascension bonus (Project Amber's specialProp).
  ascensionStat: z.object({ stat: screenStatSchema, value: z.number() }),
  icons: z.object({ avatar: z.string() }),
  talents: z.array(talentSchema).min(1),
  // Kit pieces from talents, passives and constellations; the weapon and
  // the artifact set carry their own.
  blocks: z.array(blockSchema).default([]),
  // Shared game systems the kit uses, expanded into blocks by the engine
  // (e.g. { "bondOfLife": { "max": 200, "initialField": "bond" } }).
  systems: z.record(z.record(z.unknown())).default({}),
  // The automatic rotation, as a priority list.
  automatic: z.array(automaticEntrySchema).optional(),
  // Warnings shown on an action when a condition does not hold.
  actionWarnings: z.array(actionWarningSchema).default([]),
  // Rules for an action beyond its timing: a condition it needs (else the
  // step is skipped with `message`), and a cooldown for actions whose
  // talent defines none (Mualani's bite).
  actionRules: z
    .array(
      z.object({
        action: z.string(),
        requires: conditionSchema.optional(),
        message: z.string().default('Cannot be used now'),
        cooldown: cooldownSchema.optional(),
        // While `while` holds, using this action performs another one; the
        // first rule that holds wins (a bite at 3 Wave Momentum, else a
        // weak bite, else the Normal Attack itself).
        replacedBy: z
          .array(z.object({ action: z.string(), while: conditionSchema }))
          .optional(),
      })
    )
    .default([]),
  // Rows of the results details panel.
  details: z.array(detailSchema).default([]),
  weapon: weaponSchema,
  passives: z.array(passiveSchema),
  constellations: z.array(constellationSchema).length(6),
  defaults: z.object({
    numbers: z.record(z.number()),
    flags: z.record(z.boolean()),
  }),
  fields: z.array(fieldSchema),
  artifactSet: artifactSetSchema,
  // Rotation editor: the palette comes from the talents' timed rows, plus
  // kit actions no talent row describes (e.g. surfing into an enemy).
  rotation: z
    .object({
      automaticDescription: z.string(),
      extraActions: z.array(rotationActionSchema).default([]),
      // The editor palette: these action ids, in this order; every other
      // action is hidden there (it still runs, e.g. in an automatic copy).
      palette: z.array(z.string()).min(1).optional(),
    })
    .optional(),
});

export type CharacterData = z.infer<typeof characterSchema>;
export type DamageElementName = (typeof DAMAGE_ELEMENTS)[number];
export type ArtifactSetData = z.infer<typeof artifactSetSchema>;
export type ConstellationData = z.infer<typeof constellationSchema>;
export type PassiveData = z.infer<typeof passiveSchema>;
export type TalentData = z.infer<typeof talentSchema>;
export type WeaponData = z.infer<typeof weaponSchema>;
export type WeaponRowData = z.infer<typeof weaponRowSchema>;
export type TalentRowData = TalentData['rows'][number];
export type MultiplierRowData = z.infer<typeof multiplierRowSchema>;
export type MultiplierStat = z.infer<typeof multiplierComponentSchema>['stat'];
