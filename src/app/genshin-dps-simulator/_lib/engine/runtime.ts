import { DescribeContext, describeEffect } from './describeBlock';
import { causeId, createEventLog, EventLog, SimEventKind } from './eventLog';
import { CONDITION_HOOKS, HookContext, OPERATION_HOOKS } from './hooks';
import { createIcd } from './icd';
import { expandSystems } from './modules';
import {
  createHitEnergy,
  ENERGY_ID,
  getEnergyConfig,
  HIT_ENERGY_ID,
} from './modules/energy';
import { createEventQueue, EventQueue } from './queue';
import {
  Amount,
  Block,
  BlockSource,
  BonusBlock,
  Condition,
  Op,
  ResourceBlock,
  StatusBlock,
  TriggerBlock,
} from './schema';
import { ActionData } from '../actionSchema';
import { CharacterData } from '../characterSchema';
import { addHit, addTransformativeHit } from '../damageEngine';
import {
  EffectData,
  getEffectTotal,
  isStatBonus,
  sumHitBonuses,
  toEffect,
} from '../effects';
import formatNumber from '../formatNumber';
import { FRAMES_PER_SECOND } from '../frames';
import { getTransformativeReaction, isAmplifyingReaction } from '../reactions';
import { readFlag, readNumber } from '../readValue';
import { RotationTraceEntry } from '../rotation/types';
import { buildStatSheet } from '../stats';
import { getRowMultiplier, getRowScaling, StatScaling } from '../talents';
import {
  CooldownEvent,
  DamageContext,
  DamageElement,
  ParsedValues,
} from '../types';

const toSeconds = (frame: number): number => frame / FRAMES_PER_SECOND;

// Particles caught in a team: another element's give 1 Energy, clear ones
// 2 (before Energy Recharge); off the field, 60%.
const CLEAR_PARTICLE = 'clear';
const CLEAR_PARTICLE_BASE = 2;
const OTHER_ELEMENT_PARTICLE = 1;
const OFF_FIELD_PARTICLES = 0.6;

// How long a dropped particle takes to be caught (gcsim's default).
const ENEMY_PARTICLE_DELAY_FRAMES = 100;

type StatusInstance = {
  uid: number;
  appliedAt: number;
  until: number;
  // The instance of the `endsWith` status it belongs to.
  parentUid: number | null;
};

type ScheduledApply = {
  statusId: string;
  frame: number;
  parentId: string | null;
  parentUid: number | null;
  done: boolean;
  // The instance it applied, once it did.
  appliedUid?: number;
};

// What the timeline needs to name and group a block's row.
export type ActivityBlock = {
  id: string;
  label: string;
  source: BlockSource;
  type: Block['type'];
  // Resources: the top of their scale, and how values read (Bond of Life
  // is a % of Max HP).
  max?: number;
  format?: 'percent';
  // Stack statuses: how long each stack lasts, and how many can be up.
  stackFrames?: number;
  stackMax?: number;
  ifFlag?: string;
  icon?: string;
  // Bonuses: what they do, in words ("+40% DMG Bonus · Pyro hits"), and
  // the value alone.
  effect?: string;
  effectShort?: string;
};

export const describeBlocks = (
  blocks: Block[],
  context?: DescribeContext
): ActivityBlock[] =>
  blocks.map((block) => {
    const described = context ? describeEffect(block, context) : undefined;
    return {
      id: block.id,
      label: block.label,
      source: block.source,
      type: block.type,
      max: block.type === 'resource' ? block.max : undefined,
      format:
        block.type === 'resource' ? block.unit ?? block.noteFormat : undefined,
      stackFrames:
        block.type === 'status' ? block.stacks?.durationFrames : undefined,
      stackMax: block.type === 'status' ? block.stacks?.max : undefined,
      ifFlag: block.ifFlag,
      icon: block.icon,
      effect: described?.effect,
      effectShort: described?.short,
    };
  });

export const createActivityLog = (blocks: Block[]): ActivityLog => ({
  blocks: describeBlocks(blocks),
  statuses: {},
  applications: {},
  stacks: {},
  triggers: {},
  bonusHits: {},
  resources: {},
});

export type ActivityLog = {
  blocks: ActivityBlock[];
  // Frames each status was active ([start, end)).
  statuses: Record<string, { start: number; end: number }[]>;
  // Each application of a status on its own: from when it was applied to
  // when it would expire, or was removed (a refresh does not shorten the
  // one before). For buff timers.
  // `until`: when it would have expired.
  applications: Record<string, { start: number; end: number; until: number }[]>;
  // Frames each stack was up ([start, end)); cut short when cleared.
  stacks: Record<string, { start: number; end: number }[]>;
  // Frames each trigger fired.
  triggers: Record<string, number[]>;
  // Hits each bonus applied to.
  bonusHits: Record<string, number>;
  // Every change of each resource.
  resources: Record<string, { frame: number; value: number }[]>;
};

export type HitRequest = {
  frame: number;
  category: string;
  element: DamageElement;
  // The talent's base DMG before bonuses: % of stats, or flat amounts.
  scaling: StatScaling[];
  actionId?: string;
  // Trigger key of the action's group ("skill" for a hold E).
  group?: string;
  // The status or trigger block that made the hit.
  sourceId?: string;
  // The rotation block of an extra hit an action's trigger made.
  blockUid?: string;
  row?: string;
  // Element units the hit applies to the enemy (1 when missing).
  gauge?: number;
  // Its elemental application ICD tag (none: it always applies) and group.
  icd?: string;
  icdGroup?: string;
  // Trace entry of the action the hit belongs to, for notes.
  entry: RotationTraceEntry | null;
};

// Frames of the named events of an action being planned, for conditions
// such as { "status": "bloodDebtDue", "atEvent": "absorb" }.
export type EvalContext = {
  eventFrames?: Record<string, number>;
  // What the previous action counts as (id, group, kind), when planning.
  previous?: string[];
};

// How a character's runtime talks to the rest of its team (see
// simulateTeam). Without it the character is alone: always on the field,
// and its own hits are the party's.
export type PartyLink = {
  // The shared clock.
  queue: EventQueue;
  // Every member's element (this character's included).
  elements: string[];
  // Whether this character is on the field at `frame`.
  isOnField: (frame: number) => boolean;
  // The id of the member on the field at `frame`.
  activeMember: (frame: number) => string;
  // The run's shared event log (the inspector's).
  events: EventLog;
  // Team buffs other members give this character's hits now (the elemental
  // resonance too). `forConversion`: only those that count toward a stat
  // another buff converts (not "Extra" ones, each valued from its giver's
  // screen stats, so they never ask each other back).
  receiveEffects: (frame: number, forConversion?: boolean) => EffectData[];
  // A hit (or reaction) this character dealt: every member's `party:` and
  // `active:` triggers react to it.
  broadcastHit: (keys: string[], frame: number) => void;
  // An action this character used ("burst", its id…): every member's
  // `party:` use triggers react to it.
  broadcastUse: (keys: string[], frame: number) => void;
  // An Elemental hit landing on the enemy's aura (teams with auras): the
  // reaction it triggers, if any: amplifying ("Melt", on the hit itself)
  // or transformative ("Overloaded", a hit of its own).
  applyElement?: (
    element: string,
    units: number,
    frame: number
  ) => string | null;
  // Particles this character made: every member catches them (the one on
  // the field fully, the others 60%).
  shareParticles: (count: number, element: string, frame: number) => void;
  // A hit another member's trigger makes with this one's stats (and its
  // element, with `attackerElement`).
  performAs: (
    attackerId: string,
    hit: HitRequest,
    attackerElement: boolean
  ) => void;
};

type RuntimeOptions = {
  character: CharacterData;
  values: ParsedValues;
  context: DamageContext;
  // The character's actions, for cooldowns they share and Energy costs.
  actions?: Record<string, ActionData>;
  party?: PartyLink;
};

const matchesHit = (
  match: BonusBlock['match'],
  hit: HitRequest,
  element: string
): boolean => {
  if (!match) {
    return true;
  }
  if (
    match.actions &&
    (!hit.actionId || !match.actions.includes(hit.actionId))
  ) {
    return false;
  }
  if (match.categories && !match.categories.includes(hit.category)) {
    return false;
  }
  if (match.elements && !match.elements.includes(element)) {
    return false;
  }
  return true;
};

export const meetsBounds = (
  value: number,
  bounds: { gt?: number; gte?: number; lt?: number; lte?: number }
): boolean =>
  (bounds.gt === undefined || value > bounds.gt) &&
  (bounds.gte === undefined || value >= bounds.gte) &&
  (bounds.lt === undefined || value < bounds.lt) &&
  (bounds.lte === undefined || value <= bounds.lte);

// Everything the engine knows during one simulation: resources, statuses,
// stacks, cooldowns, ICDs, counters, the event queue and the activity log.
export const createRuntime = ({
  character,
  values,
  context,
  actions = {},
  party,
}: RuntimeOptions) => {
  const eventLog = party?.events ?? createEventLog();
  // The rotation step whose effects are running now (set while a
  // trigger's ops run): what the events made now are caused by.
  let currentCause: string | null = null;
  const causeOf = (entry: RotationTraceEntry | null | undefined) =>
    entry && entry.blockUid ? causeId(entry) : null;
  const logEvent = (
    kind: SimEventKind,
    frame: number,
    blockId?: string,
    detail?: Record<string, string | number | null>,
    cause: string | null = currentCause
  ) =>
    eventLog.push({
      frame,
      characterId: character.id,
      kind,
      blockId,
      detail,
      cause,
    });
  // Blocks whose UI flag is off do not exist in this run.
  // A system's resources and statuses come first; its triggers run after
  // the kit's own (a Nightsoul Burst after a Burst uses up its stacks).
  const systemBlocks = expandSystems(character);
  const blocks: Block[] = [
    ...systemBlocks.filter((block) => block.type !== 'trigger'),
    ...character.blocks,
    ...systemBlocks.filter((block) => block.type === 'trigger'),
    ...character.artifactSet.blocks,
    ...character.weapon.blocks,
  ].filter((block) => !block.ifFlag || readFlag(values, block.ifFlag));

  const resourceBlocks = new Map(
    blocks
      .filter((block): block is ResourceBlock => block.type === 'resource')
      .map((block) => [block.id, block])
  );
  const statusBlocks = new Map(
    blocks
      .filter((block): block is StatusBlock => block.type === 'status')
      .map((block) => [block.id, block])
  );
  const triggers = blocks.filter(
    (block): block is TriggerBlock => block.type === 'trigger'
  );
  // Statuses some trigger waits on the end of.
  const endListeners = new Set(
    triggers.flatMap((trigger) =>
      'statusEnds' in trigger.when ? [trigger.when.statusEnds] : []
    )
  );
  const queue = party?.queue ?? createEventQueue();
  const resources = new Map<string, number>();
  const instances = new Map<string, StatusInstance>();
  // Each stack's frame, and who holds it (`holder: "active"`), else null.
  const stackTimes = new Map<
    string,
    { addedAt: number; holder: string | null; logIndex: number }[]
  >();
  const scheduled: ScheduledApply[] = [];
  // Per cooldown id, when each of its charges is ready (one entry unless
  // the action has `charges`).
  const cooldownReadyAt = new Map<string, number[]>();
  const cooldownEvents = new Map<string, CooldownEvent[]>();
  const icdReadyAt = new Map<string, number>();
  // Chance triggers with a cooldown: until when the current one lasts, and
  // the chance that nothing fired it yet.
  const chanceWindows = new Map<string, { end: number; miss: number }>();
  const counters = new Map<string, number>();
  const rowMultipliers = new Map<string, number>();
  const rowScalings = new Map<string, StatScaling[]>();
  const sheet = buildStatSheet(character, values);
  const statName = character.scalingStat;
  let nextUid = 1;

  const activity = createActivityLog(blocks);
  const logPush = <T>(log: Record<string, T[]>, id: string, item: T) => {
    (log[id] ??= []).push(item);
  };

  const count = (key: string, by = 1) => {
    counters.set(key, (counters.get(key) ?? 0) + by);
  };

  const rowMultiplier = (ref: string): number => {
    const cached = rowMultipliers.get(ref);
    if (cached !== undefined) {
      return cached;
    }
    const value = getRowMultiplier(character, ref, values);
    rowMultipliers.set(ref, value);
    return value;
  };

  const rowScaling = (ref: string): StatScaling[] => {
    const cached = rowScalings.get(ref);
    if (cached !== undefined) {
      return cached;
    }
    const value = getRowScaling(character, ref, values);
    rowScalings.set(ref, value);
    return value;
  };

  // The party's elements (alone, its own), for party element counts.
  const partyElements = party?.elements ?? [character.element];
  const partyElementCount = (elements: string[]) =>
    partyElements.filter((element) => elements.includes(element)).length;

  // Bonuses that read a talent row get its value at this run's level; those
  // that read a form field, the field's; those scaled by a party element
  // count, the value for it (1-based, as a field's).
  const allBonuses = blocks
    .filter((block): block is BonusBlock => block.type === 'bonus')
    .map((block) => ({
      ...block,
      ...(block.valueRow ? { value: rowMultiplier(block.valueRow) } : {}),
      ...(block.valueField
        ? { value: readNumber(values, block.valueField) }
        : {}),
      ...(block.capRow ? { cap: rowMultiplier(block.capRow) } : {}),
      ...(block.scaleBy &&
      'partyElements' in block.scaleBy &&
      Array.isArray(block.value)
        ? {
            value:
              block.value[
                Math.min(
                  block.value.length,
                  Math.max(1, partyElementCount(block.scaleBy.partyElements))
                ) - 1
              ],
            scaleBy: undefined,
          }
        : {}),
    }));
  // Team buffs are for the rest of the party: only the details read them.
  const bonuses = allBonuses.filter((block) => !block.teamBuff);
  const teamBuffs = new Map(
    allBonuses
      .filter((block) => block.teamBuff && isStatBonus(block))
      .map((block) => [block.id, block])
  );
  const statBonuses: { block: BonusBlock; effect: EffectData }[] = bonuses
    .filter(isStatBonus)
    .map((block) => ({ block, effect: toEffect(block) }));
  const resolvedBlocks = blocks.map(
    (block) => allBonuses.find((bonus) => bonus.id === block.id) ?? block
  );

  // The timeline explains each bonus with this run's values.
  activity.blocks = describeBlocks(resolvedBlocks, {
    values,
    scalingStat: character.scalingStat,
    rowMultiplier,
    labelOf: (id) => {
      const resource = resourceBlocks.get(id);
      if (resource) {
        const unit = resource.unit ?? resource.noteFormat;
        return { label: resource.label, percent: unit === 'percent' };
      }
      const status = statusBlocks.get(id);
      return status ? { label: status.label, percent: false } : undefined;
    },
  });

  // ---------------------------------------------------------- resources

  resourceBlocks.forEach((block) => {
    const initial =
      typeof block.initial === 'number'
        ? block.initial
        : readNumber(values, block.initial.field);
    const value = Math.min(block.max, Math.max(block.min, initial));
    resources.set(block.id, value);
    logPush(activity.resources, block.id, { frame: 0, value });
  });

  const getResource = (id: string): number => resources.get(id) ?? 0;

  // ---------------------------------------------------------- statuses

  // `holder`: whose stacks count (this character's own by default).
  const getStackCount = (
    id: string,
    frame: number,
    holder: string = character.id
  ): number => {
    const block = statusBlocks.get(id);
    if (!block?.stacks) {
      return 0;
    }
    // A stack added on this very frame does not count yet. Whole frames,
    // so a stack lasts exactly its duration.
    const windowStart = frame - block.stacks.durationFrames;
    const active = (stackTimes.get(id) ?? []).filter(
      (stack) =>
        stack.addedAt < frame &&
        stack.addedAt >= windowStart &&
        (stack.holder === null || stack.holder === holder)
    ).length;
    return Math.min(block.stacks.max, active);
  };

  // A bonus's `if` (any condition, e.g. off the field) at `frame`.
  const bonusIfHolds = (block: BonusBlock, frame: number): boolean =>
    !block.if || evaluate(block.if, frame);

  const isActive = (id: string, frame: number): boolean => {
    const block = statusBlocks.get(id);
    if (block?.stacks) {
      return getStackCount(id, frame) > 0;
    }
    const instance = instances.get(id);
    if (!instance || frame < instance.appliedAt || frame >= instance.until) {
      return false;
    }
    if (block?.endsWith) {
      const parent = instances.get(block.endsWith);
      return (
        parent !== undefined &&
        parent.uid === instance.parentUid &&
        isActive(block.endsWith, frame)
      );
    }
    return true;
  };

  const isScheduledParentCurrent = (entry: ScheduledApply): boolean =>
    !entry.parentId || instances.get(entry.parentId)?.uid === entry.parentUid;

  // Its parent (if any) is still the same instance, and lasts until then.
  const willApply = (entry: ScheduledApply): boolean =>
    !entry.parentId ||
    (isScheduledParentCurrent(entry) &&
      (instances.get(entry.parentId)?.until ?? 0) > entry.frame);

  // Active at `frame`, or will be by then through a scheduled application.
  const isActiveAt = (id: string, frame: number): boolean =>
    isActive(id, frame) ||
    scheduled.some(
      (entry) =>
        !entry.done &&
        entry.statusId === id &&
        entry.frame <= frame &&
        willApply(entry)
    );

  const getStateValues = (
    frame: number,
    holder: string = character.id
  ): Record<string, number> => {
    const state: Record<string, number> = {};
    resources.forEach((value, id) => {
      state[id] = value;
    });
    statusBlocks.forEach((block, id) => {
      state[id] = block.stacks
        ? getStackCount(id, frame, holder)
        : Number(isActive(id, frame));
    });
    return state;
  };

  const closeInterval = (id: string, frame: number) => {
    const intervals = activity.statuses[id];
    const last = intervals?.[intervals.length - 1];
    if (last && last.end > frame) {
      last.end = frame;
    }
  };

  // Hits of a status' ticks; defined below with the hit pipeline.
  // eslint-disable-next-line prefer-const
  let performHit: (hit: HitRequest) => void;

  const applyStatusNow = (id: string, frame: number) => {
    const block = statusBlocks.get(id);
    if (!block) {
      throw new Error(`${character.name} has no status "${id}"`);
    }
    if (block.stacks) {
      const times = stackTimes.get(id) ?? [];
      const { durationFrames } = block.stacks;
      // Stacks past their window never count again.
      const windowStart = frame - durationFrames;
      const added = {
        addedAt: frame,
        holder:
          block.stacks.holder === 'active'
            ? party?.activeMember(frame) ?? character.id
            : null,
        logIndex: activity.stacks[id]?.length ?? 0,
      };
      let kept = [
        ...times.filter((stack) => stack.addedAt >= windowStart),
        added,
      ];
      // At the max, a new stack replaces the oldest one up (of the same
      // holder), as in-game: never more than `max` at once. What counts is
      // unchanged (the newest ones always outlast the oldest).
      const up = kept.filter(
        (stack) =>
          stack.holder === added.holder &&
          stack.addedAt >= frame + 1 - durationFrames
      );
      const replaced = up.slice(0, Math.max(0, up.length - block.stacks.max));
      if (replaced.length > 0) {
        kept = kept.filter((stack) => !replaced.includes(stack));
        replaced.forEach((stack) => {
          const logged = activity.stacks[id]?.[stack.logIndex];
          if (logged && logged.end > frame + 1) {
            logged.end = frame + 1;
          }
        });
      }
      stackTimes.set(id, kept);
      logEvent('stack.add', frame, id, {
        holder: kept[kept.length - 1].holder,
        until: frame + durationFrames + 1,
      });
      // It counts from the next frame through its whole duration.
      logPush(activity.stacks, id, {
        start: frame + 1,
        end: frame + durationFrames + 1,
      });
      // The newest stack running out is the status ending (for
      // `statusEnds`), unless it was cleared first.
      if (endListeners.has(id)) {
        queue.push(frame + durationFrames + 1, (endFrame) => {
          if (stackTimes.get(id) === kept) {
            fireTriggers('statusEnds', [id], endFrame, null);
          }
        });
      }
      return;
    }
    // A status tied to another one only exists while that one is up.
    if (block.endsWith && !isActive(block.endsWith, frame)) {
      return;
    }
    closeInterval(id, frame);
    // A status tied to another one never outlasts it.
    const parent = block.endsWith ? instances.get(block.endsWith) : undefined;
    const instance: StatusInstance = {
      uid: nextUid,
      appliedAt: frame,
      until: Math.min(
        frame + (block.durationFrames ?? Number.POSITIVE_INFINITY),
        parent?.until ?? Number.POSITIVE_INFINITY
      ),
      parentUid: parent?.uid ?? null,
    };
    nextUid += 1;
    const replaced = instances.get(id);
    instances.set(id, instance);
    // Statuses tied to the instance this one replaces end with it.
    if (replaced) {
      statusBlocks.forEach((child, childId) => {
        if (
          child.endsWith === id &&
          instances.get(childId)?.parentUid === replaced.uid
        ) {
          removeStatus(childId, frame);
        }
      });
    }
    logPush(activity.applications, id, {
      start: frame,
      end: instance.until,
      until: instance.until,
    });
    logEvent(
      replaced && replaced.until > frame ? 'status.refresh' : 'status.apply',
      frame,
      id,
      { until: Number.isFinite(instance.until) ? instance.until : null }
    );
    // A refresh while it is up extends the logged interval.
    const intervals = activity.statuses[id];
    const last = intervals?.[intervals.length - 1];
    if (last && last.end === frame) {
      last.end = instance.until;
    } else {
      logPush(activity.statuses, id, { start: frame, end: instance.until });
    }

    const { drain } = block;
    if (drain) {
      const resource = resourceBlocks.get(drain.resource);
      if (!resource) {
        throw new Error(
          `"${id}" drains an unknown resource "${drain.resource}"`
        );
      }
      const tick = (tickFrame: number) => {
        if (
          instances.get(id)?.uid !== instance.uid ||
          !isActive(id, tickFrame)
        ) {
          return;
        }
        setResource(
          drain.resource,
          getResource(drain.resource) - drain.amount,
          tickFrame
        );
        // It lasts through the frame its last point drains, and ends (with
        // its `statusEnds` triggers) on the next one, as an expiry does.
        if (getResource(drain.resource) <= resource.min) {
          queue.push(tickFrame + 1, (endFrame) => {
            if (instances.get(id)?.uid === instance.uid) {
              removeStatus(id, endFrame);
            }
          });
          return;
        }
        queue.push(tickFrame + drain.everyFrames, tick);
      };
      queue.push(frame + (drain.firstAfterFrames ?? drain.everyFrames), tick);
    }

    // Expiring is an end too, for `statusEnds` triggers.
    if (instance.until !== Number.POSITIVE_INFINITY && endListeners.has(id)) {
      queue.push(instance.until, (endFrame) => {
        const current = instances.get(id);
        if (current?.uid === instance.uid && current.until === endFrame) {
          fireTriggers('statusEnds', [id], endFrame, null);
        }
      });
    }

    const { ticks } = block;
    if (ticks) {
      const first = ticks.firstAfterFrames ?? ticks.everyFrames;
      for (let tick = 1; tick <= ticks.count; tick++) {
        const at = Math.ceil(first + ticks.everyFrames * (tick - 1));
        queue.push(frame + at, (tickFrame) => {
          if (instances.get(id)?.uid !== instance.uid) {
            return;
          }
          if (!isActive(id, tickFrame)) {
            return;
          }
          performHit({
            frame: tickFrame,
            category: ticks.category,
            element: ticks.element,
            scaling: rowScaling(ticks.row),
            sourceId: id,
            gauge: ticks.gauge,
            icd: ticks.icd,
            icdGroup: ticks.icdGroup,
            entry: null,
          });
        });
      }
    }
  };

  const scheduleStatus = (id: string, frame: number) => {
    const block = statusBlocks.get(id);
    const parentId = block?.endsWith ?? null;
    const entry: ScheduledApply = {
      statusId: id,
      frame,
      parentId,
      parentUid: parentId ? instances.get(parentId)?.uid ?? null : null,
      done: false,
    };
    scheduled.push(entry);
    queue.push(frame, (applyFrame) => {
      if (entry.done) {
        return;
      }
      entry.done = true;
      if (
        parentId &&
        (!isScheduledParentCurrent(entry) || !isActive(parentId, applyFrame))
      ) {
        return;
      }
      applyStatusNow(id, applyFrame);
      entry.appliedUid = instances.get(id)?.uid;
    });
  };

  // Ends a status on `frame` (it is no longer up then) and fires its
  // `statusEnds` triggers.
  const removeStatus = (id: string, frame: number) => {
    const block = statusBlocks.get(id);
    if (block?.stacks) {
      // Only stacks still up end now (one added on this frame counts too).
      const windowStart = frame - block.stacks.durationFrames;
      const times = stackTimes.get(id) ?? [];
      if (times.some((stack) => stack.addedAt >= windowStart)) {
        stackTimes.set(id, []);
        logEvent('stack.clear', frame, id);
        (activity.stacks[id] ?? []).forEach((stack) => {
          stack.end = Math.min(stack.end, Math.max(stack.start, frame));
        });
        fireTriggers('statusEnds', [id], frame, null);
      }
      return;
    }
    const instance = instances.get(id);
    if (!instance || frame < instance.appliedAt || frame >= instance.until) {
      return;
    }
    instance.until = frame;
    logEvent('status.remove', frame, id);
    closeInterval(id, frame);
    const application = activity.applications[id]?.at(-1);
    if (application && application.end > frame) {
      application.end = frame;
    }
    // Statuses tied to this instance end with it.
    statusBlocks.forEach((block, childId) => {
      if (
        block.endsWith === id &&
        instances.get(childId)?.parentUid === instance.uid
      ) {
        removeStatus(childId, frame);
      }
    });
    scheduled.forEach((entry) => {
      if (entry.parentId === id && entry.parentUid === instance.uid) {
        entry.done = true;
      }
    });
    fireTriggers('statusEnds', [id], frame, null);
  };

  const getSecondsUntil = (id: string, frame: number): number | null => {
    const entry = scheduled.find(
      (candidate) =>
        !candidate.done &&
        candidate.statusId === id &&
        isScheduledParentCurrent(candidate)
    );
    return entry ? toSeconds(entry.frame - frame) : null;
  };

  // ---------------------------------------------------------- cooldowns

  const getCharges = (cooldownId: string): number =>
    Math.max(
      1,
      ...Object.values(actions)
        .filter((action) => action.cooldownId === cooldownId)
        .map((action) => action.cooldown?.charges ?? 1)
    );

  const getChargeTimes = (cooldownId: string): number[] =>
    cooldownReadyAt.get(cooldownId) ??
    Array.from({ length: getCharges(cooldownId) }, () => 0);

  // When the next charge is ready.
  const getCooldownReadyAt = (cooldownId: string): number =>
    Math.min(...getChargeTimes(cooldownId));

  const setCharge = (cooldownId: string, index: number, readyAt: number) => {
    const times = [...getChargeTimes(cooldownId)];
    times[index] = readyAt;
    cooldownReadyAt.set(cooldownId, times);
  };

  // The charge an action uses: the one ready soonest.
  const soonestCharge = (cooldownId: string): number => {
    const times = getChargeTimes(cooldownId);
    return times.indexOf(Math.min(...times));
  };

  const recordCooldown = (actionId: string, frame: number) => {
    const events = cooldownEvents.get(actionId) ?? [];
    events.push({
      time: toSeconds(frame),
      readyAt: toSeconds(getCooldownReadyAt(actionId)),
      charges: getChargeTimes(actionId).map(toSeconds),
    });
    cooldownEvents.set(actionId, events);
  };

  // Charges recharge one at a time: a charge used while another is still
  // recharging starts its own cooldown after that one is back.
  const startCooldown = (
    cooldownId: string,
    frame: number,
    readyAt: number
  ) => {
    const times = getChargeTimes(cooldownId);
    // A held (deferred) charge is the one starting now.
    const held = times.indexOf(Number.POSITIVE_INFINITY);
    const index = held >= 0 ? held : soonestCharge(cooldownId);
    const recharging = times.filter(
      (time, other) =>
        other !== index && time > frame && time !== Number.POSITIVE_INFINITY
    );
    const queuedAfter = recharging.length > 0 ? Math.max(...recharging) : frame;
    setCharge(cooldownId, index, queuedAfter + (readyAt - frame));
    recordCooldown(cooldownId, frame);
  };

  // When each deferred cooldown started being held, for the timeline.
  const cooldownHolds = new Map<string, number[]>();
  // A deferred cooldown: not ready until a `startCooldown` op starts it.
  const holdCooldown = (cooldownId: string, frame: number) => {
    cooldownHolds.set(cooldownId, [
      ...(cooldownHolds.get(cooldownId) ?? []),
      toSeconds(frame),
    ]);
    setCharge(cooldownId, soonestCharge(cooldownId), Number.POSITIVE_INFINITY);
  };

  // ---------------------------------------------------------- energy

  const energy = getEnergyConfig(character, values);
  const hitEnergy =
    energy && createHitEnergy(character.weaponType, context.critMode);

  // Particles in flight: Energy that is coming, and when.
  const incomingEnergy: { frame: number; amount: number }[] = [];

  // Particles fly for a while: their Energy counts as coming (a Q waiting
  // for it) until they are caught.
  const catchParticles = (
    frame: number,
    amount: number,
    onCatch: () => void
  ) => {
    const incoming = { frame, amount };
    incomingEnergy.push(incoming);
    queue.push(frame, (catchFrame) => {
      incomingEnergy.splice(incomingEnergy.indexOf(incoming), 1);
      onCatch();
      setResource(ENERGY_ID, getResource(ENERGY_ID) + amount, catchFrame);
    });
  };

  // The enemy drops clear particles every time it loses a share of its HP
  // (the damage dealt so far, never reset).
  const enemyHp = Math.max(0, readNumber(values, 'enemyHp'));
  const dropDamage =
    (enemyHp * Math.max(0, readNumber(values, 'enemyParticleEvery'))) / 100;
  const dropParticles = Math.max(0, readNumber(values, 'enemyParticles'));
  let damageTaken = 0;
  const dropEnemyParticles = (damage: number, frame: number) => {
    if (!energy || dropDamage <= 0 || dropParticles <= 0) {
      return;
    }
    const before = Math.floor(damageTaken / dropDamage);
    damageTaken += damage;
    const drops = Math.floor(damageTaken / dropDamage) - before;
    for (let drop = 0; drop < drops; drop++) {
      catchParticles(
        frame + ENEMY_PARTICLE_DELAY_FRAMES,
        dropParticles * energy.perClearParticle,
        () => count('count:enemyParticles', dropParticles)
      );
    }
  };

  // Normal and Charged Attack hits (their forms too, by group) may restore
  // 1 flat Energy.
  const gainHitEnergy = (group: string | undefined, frame: number) => {
    if (!hitEnergy || (group !== 'normal' && group !== 'charged')) {
      return;
    }
    const gained = hitEnergy(frame);
    if (gained > 0) {
      count('count:hitEnergy', gained);
      setResource(ENERGY_ID, getResource(ENERGY_ID) + gained, frame);
      setResource(HIT_ENERGY_ID, getResource(HIT_ENERGY_ID) + gained, frame);
    }
  };

  const getEnergyCost = (actionId: string): number =>
    energy ? actions[actionId]?.energyCost ?? 0 : 0;

  const hasEnergyFor = (actionId: string): boolean =>
    getResource(ENERGY_ID) >= getEnergyCost(actionId);

  // When the Energy for the action is there, counting particles already
  // flying; null if they are not enough.
  const getEnergyArrival = (actionId: string, frame: number): number | null => {
    const cost = getEnergyCost(actionId);
    let total = getResource(ENERGY_ID);
    if (total >= cost) {
      return frame;
    }
    const coming = [...incomingEnergy].sort((a, b) => a.frame - b.frame);
    for (const particle of coming) {
      total += particle.amount;
      if (total >= cost) {
        return Math.max(frame, particle.frame);
      }
    }
    return null;
  };

  // An action id, or a cooldown id several actions share ("skill").
  const getCooldownId = (id: string): string => actions[id]?.cooldownId ?? id;

  const isReady = (id: string, frame: number): boolean =>
    frame >= getCooldownReadyAt(getCooldownId(id)) && hasEnergyFor(id);

  // Expected-damage runs need a stable result, so they take the average.
  const rollParticles = (
    particles: Extract<Op, { particles: unknown }>['particles']
  ): number => {
    if (typeof particles === 'number') {
      return particles;
    }
    const { min, max, maxChance } = particles;
    if (context.critMode === 'expected') {
      return min + (max - min) * maxChance;
    }
    return Math.random() < maxChance ? max : min;
  };

  // Cuts only the part of the cooldown still running; a held (deferred)
  // cooldown has not started, so there is nothing to cut yet.
  // With charges, the one recharging soonest is cut, and the ones queued
  // behind it (they recharge one at a time) come back that much earlier.
  const reduceCooldown = (actionId: string, cut: number, frame: number) => {
    const cooldownId = getCooldownId(actionId);
    const times = getChargeTimes(cooldownId);
    const running = times.filter(
      (time) => time > frame && time !== Number.POSITIVE_INFINITY
    );
    if (running.length === 0) {
      return;
    }
    const readyAt = Math.min(...running);
    const reduced = Math.min(cut, readyAt - frame);
    if (reduced <= 0) {
      return;
    }
    cooldownReadyAt.set(
      cooldownId,
      times.map((time) =>
        time >= readyAt && time !== Number.POSITIVE_INFINITY
          ? time - reduced
          : time
      )
    );
    count(`cooldownCut:${actionId}`, reduced);
    recordCooldown(cooldownId, frame);
  };

  // ---------------------------------------------------------- conditions

  const hookContext = (frame: number): HookContext => ({
    frame,
    values,
    getResource,
    isStatusActive: isActive,
  });

  const evaluate = (
    condition: Condition,
    frame: number,
    evalContext: EvalContext = {}
  ): boolean => {
    if ('resource' in condition) {
      return meetsBounds(getResource(condition.resource), condition);
    }
    if ('status' in condition) {
      if (condition.atEvent) {
        const eventFrame =
          evalContext.eventFrames?.[condition.atEvent] ?? frame;
        return isActiveAt(condition.status, eventFrame);
      }
      return isActive(condition.status, frame);
    }
    if ('flag' in condition) {
      return readFlag(values, condition.flag);
    }
    if ('field' in condition) {
      return meetsBounds(readNumber(values, condition.field), condition);
    }
    if ('ready' in condition) {
      return isReady(condition.ready, frame);
    }
    if ('previous' in condition) {
      return evalContext.previous?.includes(condition.previous) ?? false;
    }
    if ('onField' in condition) {
      return party?.isOnField(frame) ?? true;
    }
    if ('partyElements' in condition) {
      const count = partyElementCount(condition.partyElements);
      return condition.everyone
        ? count === partyElements.length
        : count >= (condition.gte ?? 1);
    }
    if ('all' in condition) {
      return condition.all.every((entry) =>
        evaluate(entry, frame, evalContext)
      );
    }
    if ('any' in condition) {
      return condition.any.some((entry) => evaluate(entry, frame, evalContext));
    }
    if ('not' in condition) {
      return !evaluate(condition.not, frame, evalContext);
    }
    const hook = CONDITION_HOOKS[condition.hook];
    if (!hook) {
      throw new Error(`Unknown condition hook "${condition.hook}"`);
    }
    return hook(hookContext(frame));
  };

  // ---------------------------------------------------------- resources (writes)

  const setResource = (
    id: string,
    requested: number,
    frame: number
  ): number => {
    const block = resourceBlocks.get(id);
    if (!block) {
      throw new Error(`${character.name} has no resource "${id}"`);
    }
    const before = getResource(id);
    const value = Math.min(block.max, Math.max(block.min, requested));
    if (value === before) {
      return 0;
    }
    resources.set(id, value);
    logPush(activity.resources, id, { frame, value });
    logEvent('resource', frame, id, { before, value });

    fireTriggers('resourceChanges', [id], frame, null, value - before);
    return value - before;
  };

  // Casting an action with an Energy cost spends it.
  const spendEnergy = (actionId: string, frame: number) => {
    const cost = getEnergyCost(actionId);
    if (cost > 0) {
      setResource(ENERGY_ID, getResource(ENERGY_ID) - cost, frame);
    }
  };

  const getAmount = (amount: Amount, frame: number): number => {
    if (typeof amount === 'number') {
      return amount;
    }
    if ('ifStatus' in amount) {
      return isActive(amount.ifStatus, frame) ? amount.then : amount.else;
    }
    if ('field' in amount) {
      return readNumber(values, amount.field);
    }
    return rowMultiplier(amount.row);
  };

  // ---------------------------------------------------------- operations

  // `sourceId`: the trigger running the op. `chance`: how likely the event
  // that fired it was (a CRIT in an expected-damage run); counts and
  // particles are scaled by it.
  // `attacker`: whose hit fired it (party and active triggers).
  type OpScope = {
    gained: number;
    sourceId?: string;
    chance: number;
    attacker?: string;
    // The frame its trigger fired (a delayed op runs later).
    firedAt?: number;
  };

  const fillTemplate = (text: string, frame: number, scope: OpScope) =>
    text
      .replace(/\{gained\}/g, formatNumber(scope.gained))
      .replace(/\{resource:([\w-]+)\}/g, (_, id: string) =>
        formatNumber(getResource(id))
      )
      .replace(/\{secondsUntil:([\w-]+)\}/g, (_, id: string) =>
        formatNumber(getSecondsUntil(id, frame) ?? 0)
      );

  const passesGuards = (op: Op, key: string, frame: number): boolean => {
    if (op.ifFlag && !readFlag(values, op.ifFlag)) {
      return false;
    }
    if (op.unlessFlag && readFlag(values, op.unlessFlag)) {
      return false;
    }
    if (op.if && !evaluate(op.if, frame)) {
      return false;
    }
    if (op.icdFrames !== undefined) {
      if (frame < (icdReadyAt.get(key) ?? Number.NEGATIVE_INFINITY)) {
        return false;
      }
      icdReadyAt.set(key, frame + op.icdFrames);
    }
    return true;
  };

  const runOp = (
    op: Op,
    frame: number,
    entry: RotationTraceEntry | null,
    scope: OpScope
  ) => {
    if ('addResource' in op) {
      let amount = getAmount(op.amount, frame);
      const budget =
        op.budget && isActive(op.budget.whileStatus, frame)
          ? op.budget.resource
          : null;
      if (budget) {
        const room = Math.max(
          0,
          (resourceBlocks.get(budget)?.max ?? 0) - getResource(budget)
        );
        amount = Math.min(amount, room);
      }
      scope.gained = setResource(
        op.addResource,
        getResource(op.addResource) + amount,
        frame
      );
      // The budget pays for what was gained, not for what a cap cut off.
      if (budget && scope.gained > 0) {
        setResource(budget, getResource(budget) + scope.gained, frame);
      }
      return;
    }
    if ('multiplyResource' in op) {
      setResource(
        op.multiplyResource,
        getResource(op.multiplyResource) * op.by,
        frame
      );
      return;
    }
    if ('setResource' in op) {
      setResource(op.setResource, op.value, frame);
      return;
    }
    if ('applyStatus' in op) {
      if (op.afterFrames) {
        scheduleStatus(op.applyStatus, frame + op.afterFrames);
      } else {
        applyStatusNow(op.applyStatus, frame);
      }
      return;
    }
    if ('removeStatus' in op) {
      removeStatus(op.removeStatus, frame);
      return;
    }
    if ('addStack' in op) {
      applyStatusNow(op.addStack, frame);
      return;
    }
    if ('reduceCooldown' in op) {
      reduceCooldown(op.reduceCooldown, op.frames, frame);
      return;
    }
    if ('hit' in op) {
      const { hit } = op;
      // Dealt by the member whose hit fired the trigger, with that one's
      // stats and element (Nicole's Arcane Projections); else by this one.
      const attacker =
        hit.asAttacker && scope.attacker !== character.id
          ? scope.attacker
          : undefined;
      queue.push(frame + (hit.afterFrames ?? 0), (hitFrame) => {
        const request: HitRequest = {
          frame: hitFrame,
          category: hit.category,
          element:
            hit.element === 'attacker'
              ? (character.element as DamageElement)
              : hit.element,
          scaling: hit.row
            ? rowScaling(hit.row)
            : [
                {
                  stat: statName,
                  value: hit.multiplierField
                    ? readNumber(values, hit.multiplierField)
                    : hit.multiplier ?? 0,
                },
              ],
          sourceId: scope.sourceId,
          blockUid: entry?.blockUid,
          gauge: hit.gauge,
          icd: hit.icd,
          icdGroup: hit.icdGroup,
          entry: null,
        };
        if (attacker && party) {
          party.performAs(attacker, request, hit.element === 'attacker');
        } else {
          performHit(request);
        }
      });
      return;
    }
    if ('reactionHit' in op) {
      const reaction = op.reactionHit;
      queue.push(frame + (op.afterFrames ?? 0), (hitFrame) =>
        performReaction(reaction, hitFrame, scope.sourceId, entry?.blockUid)
      );
      return;
    }
    if ('particles' in op) {
      if (!energy) {
        throw new Error('The "particles" op needs the "energy" system');
      }
      const caught = rollParticles(op.particles) * scope.chance;
      const catchFrame = frame + (op.afterFrames ?? 0);
      logEvent('particles', frame, scope.sourceId, {
        count: caught,
        element: op.clear ? CLEAR_PARTICLE : character.element,
        arrives: catchFrame,
      });
      if (party) {
        count('particles', caught);
        party.shareParticles(
          caught,
          op.clear ? CLEAR_PARTICLE : character.element,
          catchFrame
        );
        return;
      }
      catchParticles(
        catchFrame,
        caught * (op.clear ? energy.perClearParticle : energy.perParticle),
        () => count('particles', caught)
      );
      return;
    }
    if ('count' in op) {
      count(
        `count:${op.count}`,
        (op.by === 'gained' ? scope.gained : 1) * scope.chance
      );
      return;
    }
    if ('heal' in op) {
      logEvent('heal', frame, scope.sourceId, {
        effect: op.heal.effect,
        short: op.heal.short ?? null,
        flag: op.ifFlag ?? null,
        target: op.heal.target,
        healed:
          op.heal.target === 'party'
            ? null
            : party?.activeMember(frame) ?? character.id,
        from: op.heal.from ?? null,
        firedAt: scope.firedAt ?? frame,
      });

      fireTriggers(
        'heal',
        scope.sourceId ? [scope.sourceId, '*'] : ['*'],
        frame,
        entry
      );
      return;
    }
    if ('note' in op) {
      if (entry) {
        entry.note = fillTemplate(op.note, frame, scope);
      }
      return;
    }
    if ('warn' in op) {
      if (entry) {
        entry.warning = fillTemplate(op.warn, frame, scope);
      }
      return;
    }
    if ('startCooldown' in op) {
      // An action id, or a cooldown id its actions share.
      const cooldown =
        actions[op.startCooldown]?.cooldown ??
        Object.values(actions).find(
          (action) => action.cooldownId === op.startCooldown && action.cooldown
        )?.cooldown;
      if (!cooldown) {
        throw new Error(`"${op.startCooldown}" has no cooldown to start`);
      }
      startCooldown(
        getCooldownId(op.startCooldown),
        frame,
        frame + cooldown.frames
      );
      return;
    }
    const hook = OPERATION_HOOKS[op.hook];
    if (!hook) {
      throw new Error(`Unknown operation hook "${op.hook}"`);
    }
    hook(hookContext(frame));
  };

  type TriggerKind =
    | 'hit'
    | 'use'
    | 'event'
    | 'resourceChanges'
    | 'statusEnds'
    | 'swap'
    | 'heal';

  const triggerKey = (trigger: TriggerBlock): [TriggerKind, string] => {
    const { when } = trigger;
    if ('hit' in when) {
      return ['hit', when.hit];
    }
    if ('use' in when) {
      return ['use', when.use];
    }
    if ('event' in when) {
      return ['event', when.event];
    }
    if ('statusEnds' in when) {
      return ['statusEnds', when.statusEnds];
    }
    if ('swap' in when) {
      return ['swap', when.swap];
    }
    if ('heal' in when) {
      return ['heal', when.heal];
    }
    return ['resourceChanges', when.resourceChanges];
  };

  // `change`: how much the resource moved, for `resourceChanges`.
  // `chance`: how likely the event is (see OpScope).
  const fireTriggers = (
    kind: TriggerKind,
    keys: string[],
    frame: number,
    entry: RotationTraceEntry | null,
    change = 0,
    chance = 1,
    attacker?: string
  ) => {
    triggers.forEach((trigger) => {
      const [triggerKind, key] = triggerKey(trigger);
      if (triggerKind !== kind || !keys.includes(key)) {
        return;
      }
      const direction =
        'resourceChanges' in trigger.when ? trigger.when.change : undefined;
      if (
        (direction === 'increase' && change <= 0) ||
        (direction === 'decrease' && change >= 0)
      ) {
        return;
      }
      if (trigger.if && !evaluate(trigger.if, frame)) {
        return;
      }
      let fireChance = chance;
      if (trigger.icdFrames !== undefined && chance < 1) {
        // A chance (a CRIT in an expected-damage run) with a cooldown: the
        // cooldown starts with the first hit that could fire it, and until
        // it is over each hit fires with the chance that none before did.
        const window = chanceWindows.get(trigger.id);
        if (window && frame < window.end) {
          fireChance = window.miss * chance;
          window.miss *= 1 - chance;
        } else {
          chanceWindows.set(trigger.id, {
            end: frame + trigger.icdFrames,
            miss: 1 - chance,
          });
        }
        if (fireChance <= 0) {
          return;
        }
      } else if (trigger.icdFrames !== undefined) {
        if (frame < (icdReadyAt.get(trigger.id) ?? Number.NEGATIVE_INFINITY)) {
          logEvent('trigger.skip', frame, trigger.id, {
            key,
            reason: 'icd',
            readyAt: icdReadyAt.get(trigger.id) ?? null,
          });
          return;
        }
        icdReadyAt.set(trigger.id, frame + trigger.icdFrames);
      }
      logPush(activity.triggers, trigger.id, frame);
      // Its ops (now or delayed) are caused by what fired it.
      const triggerCause = causeOf(entry) ?? currentCause;
      logEvent(
        'trigger',
        frame,
        trigger.id,
        { key, chance: fireChance },
        triggerCause
      );
      const scope: OpScope = {
        gained: 0,
        sourceId: trigger.id,
        chance: fireChance,
        attacker,
        firedAt: frame,
      };
      trigger.do.forEach((op, index) => {
        const run = (runFrame: number) => {
          if (passesGuards(op, `${trigger.id}#${index}`, runFrame)) {
            const outerCause = currentCause;
            currentCause = triggerCause;
            logEvent('op', runFrame, trigger.id, {
              index,
              op:
                Object.keys(op).find(
                  (key) =>
                    ![
                      'ifFlag',
                      'unlessFlag',
                      'if',
                      'icdFrames',
                      'delayFrames',
                    ].includes(key)
                ) ?? null,
            });
            runOp(op, runFrame, entry, scope);
            currentCause = outerCause;
          }
        };
        if (op.delayFrames) {
          // A delayed removal ends the instance that is up now (or, if none
          // is, the one already scheduled to be applied), not one applied
          // in between.
          const removed =
            'removeStatus' in op && !statusBlocks.get(op.removeStatus)?.stacks
              ? op.removeStatus
              : null;
          const current = removed ? instances.get(removed) : undefined;
          const upNow =
            removed && current && isActive(removed, frame)
              ? current.uid
              : undefined;
          const pending =
            removed && upNow === undefined
              ? scheduled.find(
                  (entry) => !entry.done && entry.statusId === removed
                )
              : undefined;
          queue.push(frame + op.delayFrames, (runFrame) => {
            if (removed) {
              const target = upNow ?? pending?.appliedUid;
              if (
                target === undefined ||
                instances.get(removed)?.uid !== target
              ) {
                return;
              }
            }
            run(runFrame);
          });
        } else {
          run(frame);
        }
      });
    });
  };

  // ---------------------------------------------------------- hits

  const noteResources = Array.from(resourceBlocks.values()).filter(
    (block) => block.noteFormat === 'percent'
  );

  performHit = (request: HitRequest) => {
    const state = getStateValues(request.frame);
    const holdsFor = (target: HitRequest, block: BonusBlock, element: string) =>
      bonusIfHolds(block, target.frame) &&
      matchesHit(block.match, target, element) &&
      Object.entries(block.while ?? {}).every(([id, bounds]) =>
        meetsBounds(state[id] ?? 0, bounds)
      );

    // 0. A category rename comes first, so every other bonus matches the
    // new category (a Surging Bite's bonuses).
    const renamed = bonuses.find(
      (block) => block.setCategory && holdsFor(request, block, request.element)
    );
    const hit = renamed?.setCategory
      ? { ...request, category: renamed.setCategory }
      : request;
    const holds = (block: BonusBlock, element: string) =>
      holdsFor(hit, block, element);

    // 1. Infusions decide the element; 2. extra multipliers scale with a
    // resource; 3. stat bonuses are summed by the shared hit math.
    const infusion = bonuses.find(
      (block) => block.infuse && holds(block, hit.element)
    );
    const element = (infusion?.infuse ?? hit.element) as DamageElement;
    const extraBlocks = bonuses.filter(
      (block) => block.addMultiplier && holds(block, element)
    );
    // Every component of the row, each on its own stat, × resource / per.
    const extraScaling: StatScaling[] = extraBlocks.flatMap((block) => {
      const extra = block.addMultiplier;
      if (!extra) {
        return [];
      }
      const factor = getResource(extra.perResource) / extra.per;
      return rowScaling(extra.row).map((part) => ({
        stat: part.stat,
        value: part.value * factor,
      }));
    });
    const scaling = [...hit.scaling, ...extraScaling];
    const reaction = bonuses.find(
      (block) => block.reaction && holds(block, element)
    );

    const effects = [
      ...statBonuses
        .filter(
          ({ block }) =>
            bonusIfHolds(block, hit.frame) &&
            matchesHit(block.match, hit, element)
        )
        .map(({ effect }) => effect),
      ...(party?.receiveEffects(hit.frame) ?? []),
    ];
    const summed = sumHitBonuses(effects, {
      values,
      element,
      category: hit.category,
      state,
      sheet,
    });

    // Components on the scaling stat make the multiplier; the others
    // (e.g. the EM part of an ATK + EM row) are added as flat base DMG.
    const scalingMultiplier = scaling
      .filter((part) => part.stat === statName)
      .reduce((sum, part) => sum + part.value, 0);
    const otherBase = scaling
      .filter((part) => part.stat !== statName)
      .reduce(
        (sum, part) =>
          sum +
          (part.stat === 'flat'
            ? part.value
            : (summed.stats[part.stat] * part.value) / 100),
        0
      );
    const effectIds = [
      ...(renamed ? [renamed.id] : []),
      ...(infusion ? [infusion.id] : []),
      ...extraBlocks.map((block) => block.id),
      ...(reaction ? [reaction.id] : []),
      ...summed.activeEffectIds,
    ];

    // On the enemy's aura: the reaction this hit triggers. An amplifying
    // one (Melt) multiplies this hit; a transformative one (Overloaded) is
    // dealt after it, by this character.
    // The share of its element the ICD lets it apply (0: none).
    const applied =
      element === 'Physical' || !party?.applyElement
        ? 0
        : icd.applies(hit.icd, hit.icdGroup, hit.frame);
    const auraReaction =
      applied > 0
        ? party?.applyElement?.(
            element,
            (hit.gauge ?? 1) * applied,
            hit.frame
          ) ?? null
        : null;
    const amplified =
      auraReaction && isAmplifyingReaction(auraReaction) ? auraReaction : null;

    addHit(context, {
      time: toSeconds(hit.frame),
      category: hit.category,
      element,
      stat: summed.stats[statName],
      multiplier: scalingMultiplier + summed.flatMultiplier,
      flatDamage: otherBase + summed.flatDamage,
      extraCrit: summed.critRate,
      extraCritDamage: summed.critDamage,
      extraBonus: summed.dmgBonus,
      extraEm: summed.elementalMastery,
      defReduction: summed.defReduction,
      defIgnore: summed.defIgnore,
      resShred: summed.resShred,
      reaction: amplified ?? reaction?.reaction,
      actionId: hit.actionId,
      sourceId: hit.sourceId,
      blockUid: hit.blockUid ?? (hit.entry?.blockUid || undefined),
      effectIds,
      notes: [
        element,
        ...(amplified ?? reaction?.reaction
          ? [amplified ?? reaction?.reaction]
          : []),
        ...noteResources.map(
          (block) => `${block.label}: ${getResource(block.id).toFixed(1)}%`
        ),
        ...summed.notes,
      ].join('; '),
    });
    logEvent(
      'hit',
      hit.frame,
      hit.actionId ?? hit.sourceId,
      { hitIndex: context.hitLog.length - 1 },
      causeOf(hit.entry) ?? currentCause
    );

    if (auraReaction && !amplified) {
      performReaction(
        auraReaction,
        hit.frame,
        hit.sourceId ?? hit.actionId,
        hit.blockUid ?? (hit.entry?.blockUid || undefined)
      );
    }

    gainHitEnergy(hit.group ?? hit.actionId, hit.frame);
    dropEnemyParticles(
      context.hitLog[context.hitLog.length - 1]?.damage ?? 0,
      hit.frame
    );
    count('hits');
    count(`hits:${hit.category}`);
    count(`hits:${hit.category}:${element}`);
    effectIds.forEach((id) => {
      count(`bonusHits:${id}`);
      activity.bonusHits[id] = (activity.bonusHits[id] ?? 0) + 1;
      const perStack = statBonuses.find(({ block }) => block.id === id)?.block
        .perStack;
      if (perStack) {
        count(
          `bonusStacks:${id}`,
          Math.min(perStack.max, Math.max(0, state[perStack.state] ?? 0))
        );
      }
    });

    const hitKeys = [
      hit.actionId,
      hit.group,
      hit.row,
      `category:${hit.category}`,
      `element:${element}`,
      ...(element === 'Physical' ? [] : ['elemental']),
      // A hit the aura amplified (Melt): `reaction:Melt` (and, for the
      // party, `party:reaction:Melt`).
      ...(amplified ? [`reaction:${amplified}`] : []),
      '*',
    ].filter(
      (key, index, keys): key is string =>
        Boolean(key) && keys.indexOf(key) === index
    );
    fireTriggers('hit', hitKeys, hit.frame, hit.entry);
    // CRIT triggers: on a CRIT, or with the CRIT Rate as their chance in
    // expected-damage runs (which never roll one).
    const logged = context.hitLog[context.hitLog.length - 1];
    const critChance =
      context.critMode === 'expected'
        ? logged?.critRate ?? 0
        : Number(logged?.isCrit ?? false);
    if (critChance > 0) {
      fireTriggers(
        'hit',
        hitKeys.map((key) => `crit:${key}`),
        hit.frame,
        hit.entry,
        0,
        critChance
      );
    }
    shareHit(hitKeys, hit.frame);
  };

  // gcsim's elemental application ICD, per tag (groups in
  // _data/icdGroups.json).
  const icd = createIcd();

  // `party:` triggers react to any member's hit, `active:` ones to the
  // active member's (a character alone is its whole party, on the field).
  const firePartyHit = (
    keys: string[],
    frame: number,
    attacker: string,
    attackerActive: boolean
  ) => {
    fireTriggers(
      'hit',
      keys.map((key) => `party:${key}`),
      frame,
      null,
      0,
      1,
      attacker
    );
    if (attackerActive) {
      fireTriggers(
        'hit',
        keys.map((key) => `active:${key}`),
        frame,
        null,
        0,
        1,
        attacker
      );
    }
  };

  // `party:` use triggers: any member used the action (Iansan's C4 on
  // another member's Q). Alone, the character's own uses.
  const firePartyUse = (keys: string[], frame: number) =>
    fireTriggers(
      'use',
      keys.map((key) => `party:${key}`),
      frame,
      null
    );

  const shareUse = (keys: string[], frame: number) => {
    if (party) {
      party.broadcastUse(keys, frame);
    } else {
      firePartyUse(keys, frame);
    }
  };

  const shareHit = (keys: string[], frame: number) => {
    if (party) {
      party.broadcastHit(keys, frame);
    } else {
      firePartyHit(keys, frame, character.id, true);
    }
  };

  // A transformative reaction's hit (Overloaded): only EM and RES shred
  // bonuses that match it (its category is the reaction's name) count.
  const performReaction = (
    reaction: string,
    frame: number,
    sourceId: string | undefined,
    blockUid: string | undefined
  ) => {
    const state = getStateValues(frame);
    const { element } = getTransformativeReaction(values, reaction);
    const request: HitRequest = {
      frame,
      category: reaction,
      element,
      scaling: [],
      sourceId,
      blockUid,
      entry: null,
    };
    const effects = [
      ...statBonuses
        .filter(
          ({ block }) =>
            bonusIfHolds(block, frame) &&
            matchesHit(block.match, request, element)
        )
        .map(({ effect }) => effect),
      ...(party?.receiveEffects(frame) ?? []),
    ].filter(
      (effect) =>
        effect.stat === 'elementalMastery' || effect.stat === 'resShred'
    );
    const summed = sumHitBonuses(effects, {
      values,
      element,
      category: reaction,
      state,
      sheet,
    });
    addTransformativeHit(context, {
      time: toSeconds(frame),
      reaction,
      extraEm: summed.elementalMastery,
      resShred: summed.resShred,
      sourceId,
      blockUid,
      effectIds: summed.activeEffectIds,
      notes: [element, reaction, ...summed.notes].join('; '),
    });
    logEvent('hit', frame, sourceId, {
      hitIndex: context.hitLog.length - 1,
      reaction,
    });
    dropEnemyParticles(
      context.hitLog[context.hitLog.length - 1]?.damage ?? 0,
      frame
    );
    count('hits');
    count(`hits:${reaction}`);
    count(`hits:${reaction}:${element}`);
    summed.activeEffectIds.forEach((id) => {
      count(`bonusHits:${id}`);
      activity.bonusHits[id] = (activity.bonusHits[id] ?? 0) + 1;
    });
    const keys = [`reaction:${reaction}`, `category:${reaction}`];
    fireTriggers('hit', keys, frame, null);
    shareHit(keys, frame);
  };

  // The team buffs this character gives a member's hit at `frame`: those
  // whose conditions hold in its own state, valued with its own stats.
  // `"active"` ones only reach the member on the field.
  // This character's stats at `frame` for a buff that converts them (its
  // Scale from her ATK): the screen's, its own bonuses that hold now and
  // what the team gives it, but no "Extra" buff.
  const getConversionSheet = (frame: number) => {
    const state = getStateValues(frame);
    const effects = [
      ...statBonuses
        .filter(
          ({ block }) => !block.match?.actions && bonusIfHolds(block, frame)
        )
        .map(({ effect }) => effect),
      ...(party?.receiveEffects(frame, true) ?? []),
    ].filter((effect) => !effect.extra);
    const { stats } = sumHitBonuses(effects, {
      values,
      element: character.element,
      category: '',
      state,
      sheet,
    });
    return { base: sheet.base, total: stats };
  };

  // `receiverId`: whose stacks count (stacks held by the active member).
  const getTeamEffects = (
    frame: number,
    receiverActive: boolean,
    forConversion = false,
    receiverId?: string
  ): EffectData[] => {
    const state = getStateValues(frame, receiverId);
    const converts = Array.from(teamBuffs.values()).some(
      (block) => block.ofStat !== undefined
    );
    // Valued from the giver's stats now; asked for another buff's
    // conversion, from its screen stats (no chain of conversions).
    const giverSheet =
      converts && !forConversion ? getConversionSheet(frame) : sheet;
    return Array.from(teamBuffs.values()).flatMap((block) => {
      if (forConversion && block.extra) {
        return [];
      }
      if (!isStatBonus(block)) {
        return [];
      }
      if (block.teamBuff === 'active' && !receiverActive) {
        return [];
      }
      const holdsNow =
        bonusIfHolds(block, frame) &&
        Object.entries(block.while ?? {}).every(([id, bounds]) =>
          meetsBounds(state[id] ?? 0, bounds)
        );
      if (!holdsNow) {
        return [];
      }
      const value = getEffectTotal(toEffect(block), values, giverSheet, state);
      if (value === 0) {
        return [];
      }
      return [
        {
          id: `${character.id}/${block.id}`,
          label: `${character.name}: ${block.label}`,
          stat: block.stat,
          value,
          extra: block.extra,
          when: {
            elements: block.match?.elements,
            categories: block.match?.categories,
          },
        },
      ];
    });
  };

  // What a team buff gives while it is up (with every stack).
  // A team buff whose flag is off gives nothing.
  const getBuffValue = (id: string): number => {
    const block = teamBuffs.get(id);
    if (block && isStatBonus(block)) {
      return getEffectTotal(toEffect(block), values, sheet);
    }
    const inFile = [
      ...character.blocks,
      ...character.artifactSet.blocks,
      ...character.weapon.blocks,
    ].some(
      (entry) => entry.id === id && entry.type === 'bonus' && entry.teamBuff
    );
    if (!inFile) {
      throw new Error(`${character.name} has no team buff "${id}"`);
    }
    return 0;
  };

  // Particles a teammate (or this character) made, caught at `frame`: of
  // its own element they give the most, of another 1 Energy each, clear
  // ones 2; 60% off the field. All × Energy Recharge.
  const receiveParticles = (
    frame: number,
    particles: number,
    element: string,
    onField: boolean
  ) => {
    if (!energy) {
      return;
    }
    const recharge = energy.perClearParticle / CLEAR_PARTICLE_BASE;
    const perParticle =
      element === CLEAR_PARTICLE
        ? energy.perClearParticle
        : element === character.element
        ? energy.perParticle
        : OTHER_ELEMENT_PARTICLE * recharge;
    catchParticles(
      frame,
      particles * perParticle * (onField ? 1 : OFF_FIELD_PARTICLES),
      () => {}
    );
  };

  // Frames a status (or at least one of its stacks) was up within the run.
  const getUptime = (id: string, durationFrames: number): number => {
    const intervals = [
      ...(activity.statuses[id] ?? []),
      ...(activity.stacks[id] ?? []),
    ].sort((first, second) => first.start - second.start);
    let total = 0;
    let coveredUntil = Number.NEGATIVE_INFINITY;
    intervals.forEach(({ start, end }) => {
      const from = Math.max(start, coveredUntil);
      const to = Math.min(end, durationFrames);
      if (to > from) {
        total += to - from;
      }
      coveredUntil = Math.max(coveredUntil, end);
    });
    return total;
  };

  const finishActivity = (durationFrames: number): ActivityLog => {
    [
      ...Object.values(activity.statuses),
      ...Object.values(activity.applications),
    ].forEach((intervals) =>
      intervals.forEach((interval) => {
        interval.end = Math.min(interval.end, durationFrames);
      })
    );
    return activity;
  };

  return {
    queue,
    evaluate,
    isActive,
    getResource,
    getCooldownReadyAt,
    getCooldownId,
    startCooldown,
    holdCooldown,
    getEnergyCost,
    hasEnergyFor,
    getEnergyArrival,
    spendEnergy,
    performHit: (hit: HitRequest) => performHit(hit),
    fireTriggers,
    rowMultiplier,
    rowScaling,
    count,
    getCounter: (key: string): number => counters.get(key) ?? 0,
    getBuffValue,
    getUptime,
    getTeamEffects,
    logEvent,
    firePartyHit,
    firePartyUse,
    shareUse,
    receiveParticles,
    getCooldownEvents: () => cooldownEvents,
    getCooldownHolds: () => cooldownHolds,
    finishActivity,
  };
};

export type KitRuntime = ReturnType<typeof createRuntime>;
