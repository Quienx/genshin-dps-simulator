import { createEventLog, SimEvent, sortEvents } from './eventLog';
import { createKitAdapter, KitAction, KitAdapter } from './kitAdapter';
import { createEventQueue } from './queue';
import { createRuntime, KitRuntime, PartyLink } from './runtime';
import { BonusStat } from './schema';
import { collectRunResult } from './simulateKit';
import { getLoadedCharacter, LoadedCharacter } from '../characterData';
import { createDamageContext } from '../damageEngine';
import { EffectData } from '../effects';
import { FRAMES_PER_SECOND } from '../frames';
import { readNumber } from '../readValue';
import { getRotationActions } from '../rotation/blocks';
import { RotationAction } from '../rotation/rotationSchema';
import {
  PlannedStep,
  playRotation,
  RotationAdapter,
} from '../rotation/sequencePlayer';
import {
  RotationSetting,
  RotationStep,
  RotationTraceEntry,
} from '../rotation/types';
import {
  CharacterSimulationResult,
  CritMode,
  DamageContext,
  DamageElement,
  ParsedValues,
} from '../types';

// A party of characters on one clock and against one enemy. Each member
// keeps its own runtime (blocks, resources, cooldowns, stats); one of them
// is on the field at a time. Rotation steps name their member in the
// action id ("iansan:burst"); a step of another member swaps to it first.

// gcsim: a swap needs 1 s since the last one.
export const SWAP_COOLDOWN_FRAMES = 60;

// Elemental resonance (2 members of an element), by effect id, with the
// bonus it gives everyone (`whileAura`: only on an enemy with that aura).
// Fervent Flames: +25% ATK. Shattering Ice: +15% CRIT Rate on a
// Cryo-affected enemy. High Voltage gives no bonus: an Electro particle on
// an Electro-related reaction (Overloaded here), once every 5 s.
type Resonance = {
  label: string;
  element: string;
  bonus?: { stat: BonusStat; value: number; whileAura?: string };
};
export const RESONANCES: Record<string, Resonance> = {
  'resonance/fervent-flames': {
    label: 'Fervent Flames (2 Pyro)',
    element: 'Pyro',
    bonus: { stat: 'atkPercent', value: 25 },
  },
  'resonance/shattering-ice': {
    label: 'Shattering Ice (2 Cryo)',
    element: 'Cryo',
    bonus: { stat: 'critRate', value: 15, whileAura: 'Cryo' },
  },
  'resonance/high-voltage': {
    label: 'High Voltage (2 Electro)',
    element: 'Electro',
  },
};
const HIGH_VOLTAGE_COOLDOWN_FRAMES = 5 * 60;

const SEPARATOR = ':';

export const toTeamActionId = (characterId: string, actionId: string) =>
  `${characterId}${SEPARATOR}${actionId}`;

export const splitTeamActionId = (
  id: string
): { characterId: string; actionId: string } => {
  const index = id.indexOf(SEPARATOR);
  return index < 0
    ? { characterId: '', actionId: id }
    : { characterId: id.slice(0, index), actionId: id.slice(index + 1) };
};

// Steps that never swap: they are done by whoever is on the field.
const FIELD_ACTIONS = new Set(['dodge', 'wait']);

export const isFieldAction = (actionId: string): boolean =>
  FIELD_ACTIONS.has(splitTeamActionId(actionId).actionId);

export type TeamMember = {
  characterId: string;
  values: ParsedValues;
  // Its file already loaded (one not registered yet, as loadCharacterFile
  // gives); else the registered character with that id.
  loaded?: LoadedCharacter;
};

// Every member's palette, with ids (and the ids its sequences name)
// prefixed by the member.
export const getTeamRotationActions = (
  characterIds: string[],
  loadedOf: (characterId: string) => LoadedCharacter = getLoadedCharacter
): RotationAction[] =>
  characterIds.flatMap((characterId) => {
    const { rotation } = loadedOf(characterId);
    if (!rotation) {
      return [];
    }
    const prefix = (id: string) => toTeamActionId(characterId, id);
    return getRotationActions(rotation).map((action) => ({
      ...action,
      id: prefix(action.id),
      steps: action.steps?.map((step) =>
        typeof step === 'string'
          ? prefix(step)
          : {
              ...step,
              action: prefix(step.action),
              performed:
                step.performed === undefined
                  ? undefined
                  : Array.isArray(step.performed)
                  ? step.performed.map(prefix)
                  : prefix(step.performed),
            }
      ),
    }));
  });

type TeamAction = {
  // -1 before the first step: nobody has acted yet.
  member: number;
  action: KitAction;
  // The member's own plan, as its adapter returned it.
  inner?: PlannedStep<KitAction>;
  innerStep?: RotationStep;
  // The swap that put `member` on the field for this step.
  swap?: { from: number; frame: number };
};

export type TeamSwap = { frame: number; characterId: string };

export type TeamMemberResult = CharacterSimulationResult & {
  characterId: string;
  name: string;
  context: DamageContext;
};

export type TeamSimulationResult = {
  members: TeamMemberResult[];
  // Every step, with its member in `action` ("iansan:burst").
  rotationTrace: RotationTraceEntry[];
  // Who came on the field, and when (the first member at frame 0).
  swaps: TeamSwap[];
  totalDamage: number;
  durationFrames: number;
  // Everything the run did, in order (the inspector).
  events: SimEvent[];
};

type MemberState = {
  characterId: string;
  name: string;
  element: DamageElement;
  runtime: KitRuntime;
  adapter: KitAdapter;
  context: DamageContext;
};

type TeamOptions = {
  critMode?: CritMode;
  // While the next member's action recharges (or waits for Energy), the
  // member on the field keeps using its automatic rotation instead of
  // swapping in and waiting.
  fillWhileWaiting?: boolean;
  // gcsim's swap_delay: frames a swap takes, from when it is pressed to
  // when the next member is on the field (and the swap cooldown starts).
  swapDelayFrames?: number;
  // The enemy's Pyro / Electro aura: Overloaded only happens when an
  // Electro hit lands on Pyro (or the reverse), and uses the aura up.
  auras?: boolean;
  // Hits from this frame on are logged but not counted (a rotation played
  // past its duration). None: every hit counts.
  countUntilFrame?: number;
};

// Element auras (gcsim's gauge theory, simplified): a hit of U units on a
// bare enemy leaves 0.8 × U, decaying to nothing over (2.5 × U + 7) s. A
// hit of an element that reacts with the aura triggers that reaction and
// takes `uses` × U units off it; the same element refreshes the aura if it
// leaves more. One aura at a time; an element that does not react with it
// here (no table entry) leaves it as it is.
const AURA_ELEMENTS = new Set(['Pyro', 'Electro', 'Cryo']);
// The hit's element → the aura's → the reaction, and how much aura it uses.
const REACTION_TABLE: Record<
  string,
  Record<string, { reaction: string; uses: number }>
> = {
  Pyro: {
    Electro: { reaction: 'Overloaded', uses: 1 },
    Cryo: { reaction: 'Melt', uses: 2 },
  },
  Electro: { Pyro: { reaction: 'Overloaded', uses: 1 } },
  Cryo: { Pyro: { reaction: 'Melt', uses: 0.5 } },
};
type Aura = { element: string; gauge: number; frame: number; decay: number };

export const simulateTeam = (
  team: TeamMember[],
  // Null: the member on the field (the first) plays its automatic list,
  // as on its own screen.
  rotation: RotationSetting | null,
  {
    critMode = 'expected',
    fillWhileWaiting = false,
    auras = false,
    swapDelayFrames = 0,
    countUntilFrame,
  }: TeamOptions = {}
): TeamSimulationResult => {
  if (team.length === 0) {
    throw new Error('A team needs at least one member');
  }
  const ids = team.map(({ characterId }) => characterId);
  if (new Set(ids).size !== ids.length) {
    throw new Error('A character can only be once in a team');
  }
  const loadedOf = (characterId: string): LoadedCharacter =>
    team.find((entry) => entry.characterId === characterId)?.loaded ??
    getLoadedCharacter(characterId);
  const durationFrames =
    Math.max(1, readNumber(team[0].values, 'duration')) * FRAMES_PER_SECOND;
  const queue = createEventQueue();
  const eventLog = createEventLog();

  // Who is on the field at each frame.
  const swaps: { frame: number; member: number }[] = [];
  const activeAt = (frame: number): number => {
    let active = -1;
    swaps.forEach((swap) => {
      if (swap.frame <= frame) {
        active = swap.member;
      }
    });
    return active;
  };

  const members: MemberState[] = [];
  const elementCount = (element: string) =>
    team.filter(
      ({ characterId }) => loadedOf(characterId).character.element === element
    ).length;
  // The party's resonances with a bonus, and the aura each one needs.
  const resonances = Object.entries(RESONANCES).flatMap(([id, resonance]) =>
    resonance.bonus && elementCount(resonance.element) >= 2
      ? [
          {
            effect: {
              id,
              label: resonance.label,
              stat: resonance.bonus.stat,
              value: resonance.bonus.value,
            } as EffectData,
            whileAura: resonance.bonus.whileAura,
          },
        ]
      : []
  );
  const resonanceEffectsAt = (frame: number): EffectData[] =>
    resonances
      .filter(
        ({ whileAura }) =>
          !whileAura || (aura?.element === whileAura && gaugeAt(frame) > 0)
      )
      .map(({ effect }) => effect);
  const highVoltage = elementCount('Electro') >= 2;
  let highVoltageReadyAt = 0;

  // Particles caught at `frame` by every member (the one on the field
  // fully); who is on the field is known only then.
  const shareParticles = (count: number, element: string, frame: number) =>
    queue.push(frame, (catchFrame) =>
      members.forEach((member, memberIndex) =>
        member.runtime.receiveParticles(
          catchFrame,
          count,
          element,
          activeAt(catchFrame) === memberIndex
        )
      )
    );

  let aura: Aura | null = null;
  const gaugeAt = (frame: number): number =>
    aura ? Math.max(0, aura.gauge - aura.decay * (frame - aura.frame)) : 0;
  const applyElement = (
    element: string,
    units: number,
    frame: number
  ): string | null => {
    if (!AURA_ELEMENTS.has(element) || units <= 0) {
      return null;
    }
    // The inspector's record of the aura after this hit.
    const logAura = (reaction: string | null) =>
      aura &&
      eventLog.push({
        frame,
        characterId: 'enemy',
        kind: 'aura',
        detail: {
          element: aura.element,
          gauge: aura.gauge,
          decay: aura.decay,
          hitElement: element,
          reaction,
        },
      });
    const current = gaugeAt(frame);
    const reacts =
      aura && current > 0 ? REACTION_TABLE[element]?.[aura.element] : undefined;
    if (aura && reacts) {
      aura = {
        ...aura,
        gauge: Math.max(0, current - reacts.uses * units),
        frame,
      };
      logAura(reacts.reaction);
      return reacts.reaction;
    }
    const applied = 0.8 * units;
    if (aura && current > 0 && aura.element === element) {
      if (applied > current) {
        aura = { ...aura, gauge: applied, frame };
        logAura(null);
      }
      return null;
    }
    // Another element that does not react with it (not modeled): the
    // aura stays.
    if (aura && current > 0) {
      return null;
    }
    aura = {
      element,
      gauge: applied,
      frame,
      decay: applied / ((2.5 * units + 7) * FRAMES_PER_SECOND),
    };
    logAura(null);
    return null;
  };

  const linkFor = (index: number): PartyLink => ({
    queue,
    elements: team.map(
      ({ characterId }) => loadedOf(characterId).character.element
    ),
    isOnField: (frame) => activeAt(frame) === index,
    activeMember: (frame) => ids[Math.max(0, activeAt(frame))],
    events: eventLog,
    receiveEffects: (frame, forConversion = false) => {
      const receiverActive = activeAt(frame) === index;
      return [
        ...resonanceEffectsAt(frame),
        ...members.flatMap((other, otherIndex) =>
          otherIndex === index
            ? []
            : other.runtime.getTeamEffects(
                frame,
                receiverActive,
                forConversion,
                ids[index]
              )
        ),
      ];
    },
    broadcastHit: (keys, frame) => {
      if (
        highVoltage &&
        keys.includes('reaction:Overloaded') &&
        frame >= highVoltageReadyAt
      ) {
        highVoltageReadyAt = frame + HIGH_VOLTAGE_COOLDOWN_FRAMES;
        shareParticles(1, 'Electro', frame);
      }
      const attackerActive = activeAt(frame) === index;
      members.forEach((member) =>
        member.runtime.firePartyHit(keys, frame, ids[index], attackerActive)
      );
    },
    broadcastUse: (keys, frame) =>
      members.forEach((member) => member.runtime.firePartyUse(keys, frame)),
    shareParticles,
    applyElement: auras ? applyElement : undefined,
    performAs: (attackerId, hit, attackerElement) => {
      const attacker = members.find(
        (member) => member.characterId === attackerId
      );
      if (!attacker) {
        throw new Error(`No team member "${attackerId}"`);
      }
      attacker.runtime.performHit({
        ...hit,
        element: attackerElement ? attacker.element : hit.element,
      });
    },
  });

  team.forEach(({ characterId, values }, index) => {
    const loaded = loadedOf(characterId);
    const context = createDamageContext(values, critMode, countUntilFrame);
    const runtime = createRuntime({
      character: loaded.character,
      values,
      context,
      actions: loaded.actions,
      party: linkFor(index),
    });
    const adapter = createKitAdapter({
      character: loaded.character,
      actions: loaded.actions,
      rotationActions: loaded.rotation
        ? getRotationActions(loaded.rotation)
        : [],
      runtime,
      durationFrames,
    });
    members.push({
      characterId,
      name: loaded.character.name,
      element: loaded.character.element,
      runtime,
      adapter,
      context,
    });
  });

  const memberOf = (step: RotationStep, previous: TeamAction) => {
    const { characterId, actionId } = splitTeamActionId(step.action);
    if (FIELD_ACTIONS.has(actionId) && previous.member >= 0) {
      return { member: previous.member, actionId };
    }
    return { member: ids.indexOf(characterId), actionId };
  };

  // When `member` is on the field after `previous`: the swap is pressed
  // once the previous action allows it and 1 s after the last member came
  // in, and takes the swap delay.
  const getSwapInFrame = (previous: TeamAction, previousStart: number) =>
    previous.member < 0
      ? 0
      : swapDelayFrames +
        Math.max(
          members[previous.member].adapter.getSwapFrame(
            previous.action,
            previousStart
          ),
          // The first member was simply on the field: no cooldown.
          swaps.length > 1
            ? swaps[swaps.length - 1].frame + SWAP_COOLDOWN_FRAMES
            : 0,
          queue.ranUntil()
        );

  // When a member's action is ready: its cooldown and its Energy (counting
  // particles already flying); null if the Energy never comes.
  const getReadyFrame = (
    member: number,
    actionId: string,
    from: number
  ): number | null => {
    const { runtime } = members[member];
    const loaded = loadedOf(ids[member]);
    if (!loaded.actions[actionId]) {
      return from;
    }
    const energyAt = runtime.getEnergyArrival(actionId, from);
    if (energyAt === null) {
      return null;
    }
    return Math.max(
      energyAt,
      runtime.getCooldownReadyAt(runtime.getCooldownId(actionId))
    );
  };

  const toTeamStep = (
    member: number,
    inner: KitAction
  ): RotationStep | null => {
    const step = members[member].adapter.toAutomaticStep(inner);
    return (
      step && { ...step, action: toTeamActionId(ids[member], step.action) }
    );
  };

  const adapter: RotationAdapter<TeamAction> = {
    initialAction: { member: -1, action: { kind: 'start' } },
    planStep: (step, previous, previousStart) => {
      const { member, actionId } = memberOf(step, previous);
      if (member < 0) {
        return null;
      }
      const innerStep = { ...step, action: actionId };
      const { adapter: own } = members[member];
      const stays = member === previous.member;
      // Swapping in: after the previous action allows a swap and the swap
      // cooldown, never before the events already run.
      const swapFrame = stays ? null : getSwapInFrame(previous, previousStart);
      if (swapFrame !== null) {
        swaps.push({ frame: swapFrame, member });
      }
      const inner =
        swapFrame === null
          ? own.planStep(innerStep, previous.action, previousStart)
          : own.planStep(innerStep, { kind: 'start' }, swapFrame);
      // A step that cannot be done does not swap either.
      if (swapFrame !== null && (!inner || own.isOverlapping?.(inner.action))) {
        swaps.pop();
      }
      if (!inner) {
        return null;
      }
      return {
        action: {
          member,
          action: inner.action,
          inner,
          innerStep,
          swap:
            swapFrame !== null && previous.member >= 0
              ? { from: previous.member, frame: swapFrame }
              : undefined,
        },
        startFrame: inner.startFrame,
        earliestFrame: inner.earliestFrame,
      };
    },
    // Without a rotation, the member on the field plays its automatic
    // list (the first one, from the start); it never swaps.
    planAutomatic: (previous, previousStart) => {
      const member = Math.max(0, previous.member);
      const own = members[member].adapter;
      const planned = own.planAutomatic(previous.action, previousStart);
      if (!planned) {
        return null;
      }
      if (previous.member < 0 && swaps.length === 0) {
        swaps.push({ frame: 0, member });
      }
      const teamStep = toTeamStep(member, planned.action);
      return {
        action: {
          member,
          action: planned.action,
          inner: planned,
          innerStep: teamStep
            ? {
                ...teamStep,
                action: splitTeamActionId(teamStep.action).actionId,
              }
            : undefined,
        },
        startFrame: planned.startFrame,
        earliestFrame: planned.earliestFrame,
      };
    },
    toAutomaticStep: ({ member, action }) =>
      member < 0 ? null : toTeamStep(member, action),
    planFiller: (step, previous, previousStart) => {
      if (!fillWhileWaiting || previous.member < 0) {
        return null;
      }
      const { member, actionId } = memberOf(step, previous);
      if (member < 0 || member === previous.member) {
        return null;
      }
      const swapFrame = getSwapInFrame(previous, previousStart);
      const readyFrame = getReadyFrame(member, actionId, swapFrame);
      if (readyFrame === null || readyFrame <= swapFrame) {
        return null;
      }
      const field = members[previous.member].adapter;
      const filler = field.planAutomatic(previous.action, previousStart);
      if (!filler || filler.startFrame >= readyFrame) {
        return null;
      }
      const innerStep = toTeamStep(previous.member, filler.action);
      return {
        action: {
          member: previous.member,
          action: filler.action,
          inner: filler,
          innerStep: innerStep
            ? {
                ...innerStep,
                action: splitTeamActionId(innerStep.action).actionId,
              }
            : undefined,
        },
        startFrame: filler.startFrame,
        earliestFrame: filler.earliestFrame,
      };
    },
    describe: (step, planned, waitedFrames) => {
      const { member, inner, innerStep } = planned.action;
      if (member < 0 || !inner || !innerStep) {
        return {
          label: step.action,
          comboIndex: null,
          endFrame: planned.startFrame,
          warning: null,
        };
      }
      const description = members[member].adapter.describe(
        innerStep,
        inner,
        waitedFrames
      );
      return {
        ...description,
        action: toTeamActionId(ids[member], innerStep.action),
        performedAction:
          description.performedAction &&
          toTeamActionId(ids[member], description.performedAction),
      };
    },
    perform: (planned, entry) => {
      const { member, inner, swap } = planned.action;
      if (swap) {
        members[swap.from].runtime.fireTriggers(
          'swap',
          ['out'],
          swap.frame,
          null
        );
        members[member].runtime.fireTriggers('swap', ['in'], swap.frame, null);
      }
      if (member >= 0 && inner) {
        members[member].adapter.perform(inner, entry);
      }
    },
    isOverlapping: ({ member, action }) =>
      member >= 0 && (members[member].adapter.isOverlapping?.(action) ?? false),
  };

  const rotationTrace = playRotation(adapter, {
    rotation,
    actions: getTeamRotationActions(ids, loadedOf),
    durationFrames,
  });
  queue.runUntil(Number.POSITIVE_INFINITY, durationFrames);

  const results: TeamMemberResult[] = members.map((member) => ({
    characterId: member.characterId,
    name: member.name,
    context: member.context,
    ...collectRunResult(
      loadedOf(member.characterId),
      member.runtime,
      durationFrames
    ),
  }));
  return {
    members: results,
    rotationTrace,
    swaps: swaps.map(({ frame, member }) => ({
      frame,
      characterId: ids[member],
    })),
    totalDamage: results.reduce(
      (sum, member) => sum + member.context.totalDamage,
      0
    ),
    durationFrames,
    events: sortEvents(eventLog.events),
  };
};
