import { DamageElementName, ScreenStat } from './characterSchema';
import { ActivityLog } from './engine/runtime';
import { RotationData } from './rotation/rotationSchema';
import { RotationSetting, RotationTraceEntry } from './rotation/types';

// The `id` of a character file (see _lib/characterData.ts).
export type CharacterId = string;

export type ScalingStat = 'atk' | 'hp' | 'def';

export type FieldSection =
  | 'stats'
  | 'talents'
  | 'passives'
  | 'weapon'
  | 'artifacts'
  | 'rotation'
  | 'enemy'
  | 'normalOnly';

export type NumberFieldDefinition = {
  kind: 'number';
  section: FieldSection;
  name: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
};

export type CheckboxFieldDefinition = {
  kind: 'checkbox';
  section: FieldSection;
  name: string;
  label: string;
};

export type FieldDefinition = NumberFieldDefinition | CheckboxFieldDefinition;

export type ArtifactSlot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';

// One stat line of a piece, as typed ('' while not chosen yet).
export type ArtifactLine = { stat: ScreenStat | ''; value: string };

export type ArtifactPiece = { main: ArtifactLine; subs: ArtifactLine[] };

// The five pieces; while `enabled`, the character screen's totals are
// computed from them instead of typed (`_lib/artifacts.ts`).
export type ArtifactBuild = {
  enabled: boolean;
  pieces: Record<ArtifactSlot, ArtifactPiece>;
};

export type SimulationValues = {
  character: CharacterId;
  numbers: Record<string, string>;
  flags: Record<string, boolean>;
  rotation: RotationSetting | null;
  artifacts?: ArtifactBuild;
};

export type ParsedValues = {
  numbers: Record<string, number>;
  flags: Record<string, boolean>;
  rotation?: RotationSetting | null;
};

export type DamageElement = DamageElementName;

export type HitInput = {
  time?: number;
  category: string;
  element: DamageElement;
  // Total of the scaling stat, and the talent % of it.
  stat: number;
  multiplier: number;
  // Base DMG on top of stat × multiplier: other stats' components of the
  // talent row and flat DMG bonuses.
  flatDamage?: number;
  extraBonus?: number;
  extraCrit?: number;
  extraCritDamage?: number;
  extraEm?: number;
  // Enemy debuffs for this hit: DEF fractions and RES points.
  defReduction?: number;
  defIgnore?: number;
  resShred?: number;
  stacks?: number | null;
  reaction?: string;
  reactionMultiplier?: number;
  notes?: string;
} & HitOrigin;

// Where a hit came from, for the activity timeline.
export type HitOrigin = {
  // The rotation action that made it ("normal", "skill", …).
  actionId?: string;
  // The status or trigger block that made it (ticks, extra hits).
  sourceId?: string;
  // The bonuses applied to it.
  effectIds?: string[];
  // The rotation block whose action made it (custom rotations, and the
  // replayed automatic one).
  blockUid?: string;
};

export type HitLogEntry = {
  index: number;
  time: number;
  category: string;
  element: DamageElement;
  multiplier: number;
  stacks: number | null;
  baseDamage: number;
  totalBonus: number;
  extraBonus: number;
  critRate: number;
  // CRIT DMG of the hit (a fraction, every bonus included).
  critDamage?: number;
  extraCrit: number;
  isCrit: boolean;
  // The scaling stat's total at the hit (ATK, HP…), every buff included.
  stat?: number;
  reaction: string;
  reactionMultiplier: number;
  notes: string;
  damage: number;
  maxDamage: number;
  cumulativeDamage: number;
  // In the run's totals: false for a hit after its counted duration (it is
  // logged, so the chart can show it, but it adds nothing).
  counted: boolean;
  // The factors it was dealt with (the inspector's breakdown):
  // (stat × multiplier / 100 + flatDamage) × (1 + totalBonus / 100) is
  // `baseDamage`; then × critMultiplier (the average in expected runs) ×
  // defMultiplier × resMultiplier × reactionMultiplier is `damage`.
  flatDamage?: number;
  critMultiplier?: number;
  defMultiplier?: number;
  resMultiplier?: number;
} & HitOrigin;

export type HighestHit = {
  category: string;
  damage: number;
  maxDamage: number;
  isCrit: boolean;
};

export type CritMode = 'random' | 'expected';

export type DamageContext = {
  values: ParsedValues;
  critMode: CritMode;
  defense: number;
  resistanceByElement: Record<DamageElement, number>;
  totalDamage: number;
  totalHits: number;
  totalCrits: number;
  damageByCategory: Record<string, number>;
  critsByCategory: Record<string, number>;
  highestHit: HighestHit | null;
  hitLog: HitLogEntry[];
  cumulativeDamage: number;
  // Hits from this frame on are logged but not counted (none: all count).
  countUntilFrame?: number;
};

export type SimulationDetail = {
  label: string;
  value: string;
};

// The cooldown changes over a run: set when the action is used and moved
// earlier by reductions. Between events it ticks down 1 s per second.
export type CooldownEvent = {
  time: number;
  readyAt: number;
  // When each charge is ready (seconds); Infinity while a deferred
  // cooldown is held.
  charges?: number[];
};

export type CooldownTrack = {
  actionId: string;
  label: string;
  events: CooldownEvent[];
  // When a deferred cooldown started being held (Mualani's E while she
  // surfs): not ready until its next event.
  holds?: number[];
};

export type CharacterSimulationResult = {
  details: SimulationDetail[];
  // Every action performed, by the custom rotation or the automatic logic.
  rotationTrace?: RotationTraceEntry[];
  cooldowns?: CooldownTrack[];
  // Kits run by the block engine: when each block was active or fired.
  activity?: ActivityLog;
};

export type CharacterDefinition = {
  id: CharacterId;
  name: string;
  element: Exclude<DamageElement, 'Physical'>;
  avatar: string;
  // Arlecchino's extra "Normal Attacks only" comparison card.
  hasNormalOnlyScenario: boolean;
  stat: ScalingStat;
  // The ATK, HP and DEF fields the kit needs, in that order.
  stats: ScalingStat[];
  elementalLabel: string;
  numberDefaults: Record<string, number>;
  flagDefaults: Record<string, boolean>;
  fields: FieldDefinition[];
  // Actions the rotation editor offers; characters without it only support
  // their automatic rotation.
  rotation?: RotationData;
  simulate: (
    context: DamageContext,
    values: ParsedValues
  ) => CharacterSimulationResult;
};

export type SimulationOutcome = {
  runId: number;
  characterId: CharacterId;
  characterName: string;
  enemyLevel: number;
  duration: number;
  context: DamageContext;
  details: SimulationDetail[];
  normalOnlyContext: DamageContext | null;
  rotationTrace?: RotationTraceEntry[];
  activity?: ActivityLog;
};

export type KitStatus =
  | 'applied'
  | 'disabled'
  | 'included'
  | 'no-effect'
  | 'not-simulated';

export type KitRow = {
  id: string;
  label: string;
  value: string;
  status?: KitStatus;
  note?: string;
  iconSrc?: string;
};

export type Build = {
  id: number;
  values: SimulationValues;
  outcome: SimulationOutcome | null;
};
