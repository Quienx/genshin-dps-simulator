import { causeId } from './eventLog';
import { ENERGY_ID } from './modules/energy';
import { KitRuntime } from './runtime';
import { AutomaticEntry } from './schema';
import { ActionData, HoldData } from '../actionSchema';
import { CharacterData } from '../characterSchema';
import formatNumber from '../formatNumber';
import { FRAMES_PER_SECOND } from '../frames';
import { RotationAction } from '../rotation/rotationSchema';
import { PlannedStep, RotationAdapter } from '../rotation/sequencePlayer';
import { RotationStep } from '../rotation/types';

type HeldStep = NonNullable<RotationStep['held']>;
import { DamageElement } from '../types';

// What the character is doing, carrying what its timing depends on.
export type KitAction =
  | { kind: 'start' }
  // `comboId`: "normal", or a Normal Attack form with a combo of its own.
  | { kind: 'normal'; index: number; comboId: string }
  | { kind: 'charged'; windup: number }
  // Any other action of the talents: E, Q, a hold E, a plunge…
  // `stepId`: the action the step asked for, when it turned into this one
  // (a Normal Attack performed as a bite).
  // `count`: a held action's count (spins of a Charged Attack); `held`:
  // its hold time instead, when it has one (see RotationStep).
  | {
      kind: 'cast';
      id: string;
      stepId?: string;
      count?: number;
      held?: HeldStep;
      // Its charge cancel, picked and allowed: the `into` action starts
      // `frames` into it; `quickLocked`: picked but locked out.
      quick?: { into: string; frames: number };
      quickLocked?: boolean;
    }
  | { kind: 'dodge' }
  | { kind: 'wait'; frames: number }
  // A step that cannot be performed now (e.g. not enough Energy): it takes
  // no time and shows its reason as a warning.
  | { kind: 'skipped'; reason: string };

type AdapterOptions = {
  character: CharacterData;
  actions: Record<string, ActionData>;
  rotationActions: RotationAction[];
  runtime: KitRuntime;
  durationFrames: number;
};

// A kit's adapter, plus what a team needs to swap out of its actions.
export type KitAdapter = RotationAdapter<KitAction> & {
  // When the character can swap out after `previous`: its "swap" cancel,
  // else the end of its animation.
  getSwapFrame: (previous: KitAction, previousStart: number) => number;
};

const DEFAULT_DODGE_RECOVERY_FRAMES = 20;

// Hits of these kinds are Physical unless they say otherwise (catalysts
// set their element); the E and Q deal the character's element.
const PHYSICAL_KINDS = new Set(['normal', 'charged', 'plunge']);

// Without an automatic list in the file: E when ready, Normal otherwise.
const DEFAULT_AUTOMATIC: AutomaticEntry[] = [
  { use: 'skill', if: { ready: 'skill' } },
  { use: 'normal' },
];

const toSeconds = (frame: number): number => frame / FRAMES_PER_SECOND;

// How many times waiting may change an action's form before it is used.
const MAX_FORM_CHANGES = 4;

export const createKitAdapter = ({
  character,
  actions,
  rotationActions,
  runtime,
  durationFrames,
}: AdapterOptions): KitAdapter => {
  // Every Normal Attack combo: the standard one and its forms'.
  const combos = Object.fromEntries(
    Object.entries(actions).flatMap(([id, action]) =>
      action.combo && action.combo.length > 0 ? [[id, action.combo]] : []
    )
  );
  const getStep = (action: { index: number; comboId: string }) =>
    combos[action.comboId]?.[action.index];
  const charged = actions.charged;
  const dodgeRecovery =
    rotationActions.find((action) => action.kind === 'dodge')?.recoveryFrames ??
    DEFAULT_DODGE_RECOVERY_FRAMES;

  // A cast's timing, held for its count (see `repeat`): its repeated hits
  // play that many times and everything after them comes later. With a
  // hold time (`repeat.hold`), held that many frames instead.
  const heldCasts = new Map<string, ActionData>();
  // Held for `held.frames`: the repeated hits from their frame every
  // `hitEveryFrames` up to the release; the later hits, the end and the
  // cancels as far after the release as after `releaseFrame`.
  const heldCastOf = (
    id: string,
    cast: ActionData,
    hold: HoldData,
    held: HeldStep
  ): ActionData => {
    const key = `${id}@${held.frames}${held.cancel ? 'c' : ''}`;
    const known = heldCasts.get(key);
    if (known) {
      return known;
    }
    const shift = held.frames - hold.releaseFrame;
    const hits = cast.hits ?? [];
    const timed: ActionData = {
      ...cast,
      hits: hits
        .flatMap((hit) => {
          if (hit.repeats) {
            const count =
              held.frames < hit.frame
                ? 0
                : Math.floor((held.frames - hit.frame) / hold.hitEveryFrames) +
                  1;
            return Array.from({ length: count }, (_, index) => ({
              ...hit,
              frame: hit.frame + index * hold.hitEveryFrames,
            }));
          }
          if (hit.frame <= hold.releaseFrame) {
            return [hit];
          }
          return held.cancel ? [] : [{ ...hit, frame: hit.frame + shift }];
        })
        .sort((first, second) => first.frame - second.frame),
      end: held.cancel
        ? held.frames
        : cast.end === undefined
        ? undefined
        : cast.end + shift,
      cancels:
        held.cancel || !cast.cancels
          ? undefined
          : Object.fromEntries(
              Object.entries(cast.cancels).map(([name, frame]) => [
                name,
                frame + shift,
              ])
            ),
    };
    heldCasts.set(key, timed);
    return timed;
  };
  const castOf = (action: {
    id: string;
    count?: number;
    held?: HeldStep;
  }): ActionData => {
    const cast = actions[action.id];
    const { repeat } = cast ?? {};
    if (repeat?.hold && action.held) {
      return heldCastOf(action.id, cast, repeat.hold, action.held);
    }
    const count = Math.min(repeat?.max ?? 1, Math.max(1, action.count ?? 1));
    if (!repeat || count === 1) {
      return cast;
    }
    const key = `${action.id}#${count}`;
    const known = heldCasts.get(key);
    if (known) {
      return known;
    }
    const hits = cast.hits ?? [];
    const lastRepeated = Math.max(
      ...hits.filter((hit) => hit.repeats).map((hit) => hit.frame)
    );
    const extra = (count - 1) * repeat.everyFrames;
    const later = (frame: number) =>
      frame > lastRepeated ? frame + extra : frame;
    const held: ActionData = {
      ...cast,
      hits: hits
        .flatMap((hit) =>
          hit.repeats
            ? Array.from({ length: count }, (_, index) => ({
                ...hit,
                frame: hit.frame + index * repeat.everyFrames,
              }))
            : [{ ...hit, frame: later(hit.frame) }]
        )
        .sort((first, second) => first.frame - second.frame),
      end: cast.end === undefined ? undefined : cast.end + extra,
      cancels:
        cast.cancels &&
        Object.fromEntries(
          Object.entries(cast.cancels).map(([key, frame]) => [
            key,
            frame + extra,
          ])
        ),
    };
    heldCasts.set(key, held);
    return held;
  };

  // Animations are not cancelled: the next action starts when this one ends.
  const getEnd = (action: KitAction): number => {
    switch (action.kind) {
      case 'normal':
        return getStep(action)?.end ?? 0;
      case 'charged':
        return (charged?.end ?? 0) - action.windup;
      case 'cast':
        return castOf(action)?.end ?? 0;
      case 'dodge':
        return dodgeRecovery;
      case 'wait':
        return action.frames;
      default:
        return 0;
    }
  };

  const getWindup = (previous: KitAction): number =>
    previous.kind === 'normal' ? charged?.windupSkippedAfterNormal ?? 0 : 0;

  // The combo position carries on across forms (a Fiery N2 after an N1),
  // unless one of the two starts over on the switch (`resetsCombo`).
  const getNextNormalIndex = (previous: KitAction, comboId: string): number =>
    previous.kind !== 'normal' ||
    (previous.comboId !== comboId &&
      (actions[previous.comboId]?.resetsCombo || actions[comboId]?.resetsCombo))
      ? 0
      : (previous.index + 1) % combos[comboId].length;

  // The action a rotation step (or automatic entry) stands for, if the
  // character has it.
  const toAction = (
    id: string,
    previous: KitAction,
    seconds = 0,
    count?: number,
    held?: HeldStep
  ): KitAction | null => {
    if (combos[id]) {
      return {
        kind: 'normal',
        comboId: id,
        index: getNextNormalIndex(previous, id),
      };
    }
    if (id === 'normal') {
      return null;
    }
    if (id === 'charged') {
      return charged ? { kind: 'charged', windup: getWindup(previous) } : null;
    }
    if (id === 'dodge') {
      return { kind: 'dodge' };
    }
    if (id === 'wait') {
      return {
        kind: 'wait',
        frames: Math.max(1, Math.round(seconds * FRAMES_PER_SECOND)),
      };
    }
    // A swap in takes no time of its own (the team adds the swap).
    if (id === 'swap') {
      return { kind: 'wait', frames: 0 };
    }
    return actions[id]
      ? {
          kind: 'cast',
          id,
          ...(count === undefined ? {} : { count }),
          ...(held === undefined ? {} : { held }),
        }
      : null;
  };

  const getEnergyShortfall = (id: string): string | null => {
    if (runtime.hasEnergyFor(id)) {
      return null;
    }
    return `Not enough Energy (${formatNumber(
      runtime.getResource(ENERGY_ID)
    )} / ${formatNumber(runtime.getEnergyCost(id))})`;
  };

  const getEventFrames = (
    action: KitAction,
    start: number
  ): Record<string, number> => {
    if (action.kind !== 'charged') {
      return {};
    }
    return Object.fromEntries(
      Object.entries(charged?.events ?? {}).map(([name, frame]) => [
        name,
        start + frame - action.windup,
      ])
    );
  };

  // The action id a planned action stands for, for its cooldown and rules.
  const getActionId = (action: KitAction): string | null => {
    if (action.kind === 'cast') {
      return action.id;
    }
    if (action.kind === 'normal') {
      return action.comboId;
    }
    return action.kind === 'charged' ? action.kind : null;
  };

  const castsDuringPrevious = (action: KitAction): boolean =>
    action.kind === 'cast' && Boolean(actions[action.id]?.castDuringPrevious);

  // An action with no animation of its own goes off at the previous
  // action's first hit (as it starts if it has none).
  const getFirstHitFrame = (action: KitAction): number => {
    switch (action.kind) {
      case 'normal':
        return getStep(action)?.hits[0]?.frame ?? 0;
      case 'charged':
        return Math.max(0, (charged?.hits?.[0]?.frame ?? 0) - action.windup);
      case 'cast':
        return castOf(action)?.hits?.[0]?.frame ?? 0;
      default:
        return 0;
    }
  };

  // The furthest frame events have run to. Planning may run them ahead
  // (waiting out a cooldown) and then drop the action; whatever comes next
  // starts no earlier, so it never sees state from its future.
  let settledFrame = 0;

  const getCancels = (
    action: KitAction
  ): Record<string, number> | undefined => {
    switch (action.kind) {
      case 'normal':
        return getStep(action)?.cancels;
      case 'charged':
        return charged?.cancels;
      case 'cast':
        return castOf(action)?.cancels;
      default:
        return undefined;
    }
  };

  // When `next` can start after `previous`, from the start of `previous`:
  // its cancel into that action (by id, then group, then kind) or else the
  // end of its animation.
  const getFollowFrames = (
    previous: KitAction,
    next: KitAction | null
  ): number => {
    // A charge cancel: its `into` action starts that soon.
    if (
      previous.kind === 'cast' &&
      previous.quick &&
      next &&
      getActionKeys(next).includes(previous.quick.into)
    ) {
      return previous.quick.frames;
    }
    const cancels = getCancels(previous);
    const key =
      cancels && next
        ? getActionKeys(next).find((candidate) => candidate in cancels)
        : undefined;
    if (!cancels || key === undefined) {
      return getEnd(previous);
    }
    const windup = previous.kind === 'charged' ? previous.windup : 0;
    return Math.max(0, cancels[key] - windup);
  };

  const getEarliestFrame = (
    action: KitAction,
    previous: KitAction,
    previousStart: number
  ): number =>
    Math.max(
      settledFrame,
      castsDuringPrevious(action)
        ? previousStart + getFirstHitFrame(previous)
        : previousStart + getFollowFrames(previous, action)
    );

  // Runs what is due by `frame` (a Blessing draining out, a delayed pickup,
  // the Wave Momentum a surf gains as it ends), so conditions there see it.
  // Everything queued so far comes from actions already performed, so it
  // goes before the action being planned.
  const settle = (frame: number) => {
    runtime.queue.runUntil(frame, durationFrames);
    settledFrame = Math.max(settledFrame, Math.min(frame, durationFrames));
  };

  // When the action's cooldown allows it, from `frame` on. A deferred
  // cooldown (waiting for a status to end) is waited out by running events
  // until it starts; never within the run gives Infinity.
  const getReadyFrame = (id: string, frame: number): number => {
    const cooldownId = runtime.getCooldownId(id);
    for (;;) {
      const readyAt = runtime.getCooldownReadyAt(cooldownId);
      if (readyAt !== Number.POSITIVE_INFINITY) {
        return Math.max(frame, readyAt);
      }
      const next = runtime.queue.nextFrame();
      if (next === null || next >= durationFrames) {
        return Number.POSITIVE_INFINITY;
      }
      settle(next);
    }
  };

  // What an action counts as: for `previous` conditions and cancels.
  const getActionKeys = (action: KitAction): string[] => {
    switch (action.kind) {
      case 'normal':
        return [
          action.comboId,
          actions[action.comboId]?.group ?? 'normal',
          'normal',
        ];
      case 'cast': {
        const cast = actions[action.id];
        return cast ? [action.id, cast.group, cast.kind] : [action.id];
      }
      case 'charged':
      case 'dodge':
      case 'wait':
        return [action.kind];
      default:
        return [];
    }
  };

  // An action that turns into another while a condition holds (checked as
  // it could start) is planned as that other one.
  const toResolvedAction = (
    id: string,
    previous: KitAction,
    previousStart: number,
    seconds = 0,
    count?: number,
    held?: HeldStep,
    quickCancel = false
  ): KitAction | null => {
    // A Dash plays the kit's own dash while it holds (the Flamestrider
    // Sprint on the bike).
    if (id === 'dodge') {
      const asDodge = Object.entries(actions).find(
        ([, entry]) => entry.asDodgeWhile
      );
      const dodge = toAction(id, previous, seconds);
      if (asDodge && dodge) {
        const frame = getEarliestFrame(dodge, previous, previousStart);
        settle(frame);
        const [dashId, dash] = asDodge;
        if (
          dash.asDodgeWhile &&
          runtime.evaluate(dash.asDodgeWhile, frame, {
            previous: getActionKeys(previous),
          })
        ) {
          const action = toAction(dashId, previous, seconds);
          if (action?.kind !== 'cast') {
            return action;
          }
          // Its charge cancel, picked: allowed after an `after` action,
          // unless that one was let go mid-spin at a locked-out frame.
          const quick = dash.quickCancel;
          if (
            quickCancel &&
            quick &&
            getActionKeys(previous).includes(quick.after)
          ) {
            const since = frame - previousStart;
            const { lockout } = quick;
            const locked =
              previous.kind === 'cast' &&
              Boolean(previous.held?.cancel) &&
              lockout !== undefined &&
              since >= lockout.fromFrame &&
              (since - lockout.fromFrame) % lockout.everyFrames <
                lockout.frames;
            return locked
              ? { ...action, stepId: id, quickLocked: true }
              : {
                  ...action,
                  stepId: id,
                  quick: { into: quick.into, frames: quick.frames },
                };
          }
          return { ...action, stepId: id };
        }
      }
    }
    const replacements = actions[id]?.replacements ?? [];
    const base = toAction(id, previous, seconds, count, held);
    if (replacements.length > 0 && base) {
      const frame = getEarliestFrame(base, previous, previousStart);
      settle(frame);
      const replacement = replacements.find((entry) =>
        runtime.evaluate(entry.while, frame, {
          previous: getActionKeys(previous),
        })
      );
      if (replacement) {
        const action = toAction(
          replacement.action,
          previous,
          seconds,
          count,
          held
        );
        return action?.kind === 'cast' ? { ...action, stepId: id } : action;
      }
    }
    return base;
  };

  // Steps whose form changed while waiting: the cooldown that was waited
  // for (the bite's, for a Normal Attack performed after surfing).
  const waitedForForm = new WeakMap<PlannedStep<KitAction>, string>();
  const planned = (
    step: PlannedStep<KitAction>,
    waitedForId: string,
    performedId: string
  ): PlannedStep<KitAction> => {
    if (waitedForId !== performedId) {
      waitedForForm.set(step, actions[waitedForId]?.shortLabel ?? waitedForId);
    }
    return step;
  };

  // Waits for the action's cooldown. If the wait changes which form the
  // step takes (the Blessing ended meanwhile), the new form is planned from
  // there: forms are decided when the action actually starts.
  const waitForReady = (
    action: KitAction,
    id: string,
    from: number,
    resolveAgain: () => KitAction | null
  ): { action: KitAction; id: string; startFrame: number } => {
    let current = { action, id, startFrame: from };
    for (let attempt = 0; attempt < MAX_FORM_CHANGES; attempt++) {
      const startFrame = getReadyFrame(current.id, current.startFrame);
      current = { ...current, startFrame };
      if (startFrame >= durationFrames) {
        return current;
      }
      settle(startFrame);
      const again = resolveAgain();
      const againId = again && getActionId(again);
      if (!again || !againId || againId === current.id) {
        return current;
      }
      current = { action: again, id: againId, startFrame };
    }
    return current;
  };

  const skip = (reason: string, frame: number): PlannedStep<KitAction> => ({
    action: { kind: 'skipped', reason },
    startFrame: frame,
    earliestFrame: frame,
  });

  // Where a custom step lands: after the previous action, its Energy, its
  // cooldown and its rule (`actionRules`) permitting.
  const planStep = (
    step: RotationStep,
    previous: KitAction,
    previousStart: number
  ): PlannedStep<KitAction> | null => {
    const action = toResolvedAction(
      step.action,
      previous,
      previousStart,
      step.seconds,
      step.count,
      step.held,
      step.quickCancel
    );
    if (!action) {
      return null;
    }
    const earliest = getEarliestFrame(action, previous, previousStart);
    const id = getActionId(action);
    if (!id) {
      return { action, startFrame: earliest, earliestFrame: earliest };
    }
    settle(earliest);
    // Waits for particles already flying; without them it cannot be cast.
    const energyAt = runtime.getEnergyArrival(id, earliest);
    if (energyAt === null || energyAt >= durationFrames) {
      return skip(getEnergyShortfall(id) ?? '', earliest);
    }
    settle(energyAt);
    // Waits for the cooldown; the wait shows up as a warning.
    const ready = waitForReady(action, id, energyAt, () =>
      toResolvedAction(
        step.action,
        previous,
        previousStart,
        step.seconds,
        step.count,
        step.held,
        step.quickCancel
      )
    );
    const { startFrame } = ready;
    if (startFrame >= durationFrames) {
      return {
        action: ready.action,
        startFrame: durationFrames,
        earliestFrame: earliest,
      };
    }
    if (ready.id !== id) {
      const formShortfall = getEnergyShortfall(ready.id);
      if (formShortfall) {
        return skip(formShortfall, startFrame);
      }
    }
    const requires = actions[ready.id]?.requires;
    if (
      requires &&
      !runtime.evaluate(requires.if, startFrame, {
        previous: getActionKeys(previous),
      })
    ) {
      const waited = startFrame - earliest;
      return skip(
        waited > 0
          ? `${requires.message} (after waiting ${formatNumber(
              toSeconds(waited)
            )} s for the cooldown)`
          : requires.message,
        startFrame
      );
    }
    return planned(
      { action: ready.action, startFrame, earliestFrame: earliest },
      id,
      ready.id
    );
  };

  const automatic = character.automatic ?? DEFAULT_AUTOMATIC;

  // The first entry whose conditions hold when the next action is picked.
  // That is the earliest frame any entry could start (a cancel), so an
  // entry turned down never holds back one that could start sooner. An
  // entry waits for its action's cooldown; checking one runs the events up
  // to then, so entries that wait long (the E between surfs) go last.
  const planAutomatic = (
    previous: KitAction,
    previousStart: number
  ): PlannedStep<KitAction> | null => {
    const candidates = automatic.flatMap((entry) => {
      if (
        entry.ifFlag &&
        !runtime.evaluate({ flag: entry.ifFlag }, previousStart)
      ) {
        return [];
      }
      if (
        entry.unlessFlag &&
        runtime.evaluate({ flag: entry.unlessFlag }, previousStart)
      ) {
        return [];
      }
      // The action itself, not its form: picking a form runs the events up
      // to its start, which must wait until the entry is chosen.
      const base = toAction(entry.use, previous);
      return base
        ? [
            {
              entry,
              base,
              earliest: getEarliestFrame(base, previous, previousStart),
            },
          ]
        : [];
    });
    if (candidates.length === 0) {
      return null;
    }
    const decision = Math.min(...candidates.map(({ earliest }) => earliest));
    settle(decision);

    for (const { entry, base, earliest } of candidates) {
      if (
        entry.if &&
        !runtime.evaluate(entry.if, Math.max(decision, settledFrame), {
          // An entry checked before may have run the events past its start.
          eventFrames: getEventFrames(base, Math.max(earliest, settledFrame)),
          previous: getActionKeys(previous),
        })
      ) {
        continue;
      }
      const action = toResolvedAction(entry.use, previous, previousStart);
      if (!action) {
        continue;
      }
      const start = getEarliestFrame(action, previous, previousStart);
      settle(start);
      const id = getActionId(action);
      if (id && !runtime.hasEnergyFor(id)) {
        continue;
      }
      if (!id) {
        return { action, startFrame: start, earliestFrame: start };
      }
      const ready = waitForReady(action, id, start, () =>
        toResolvedAction(entry.use, previous, previousStart)
      );
      const { startFrame } = ready;
      if (startFrame >= durationFrames) {
        continue;
      }
      if (ready.id !== id && !runtime.hasEnergyFor(ready.id)) {
        continue;
      }
      const requires = actions[ready.id]?.requires;
      if (
        requires &&
        !runtime.evaluate(requires.if, startFrame, {
          previous: getActionKeys(previous),
        })
      ) {
        continue;
      }
      return planned(
        { action: ready.action, startFrame, earliestFrame: start },
        id,
        ready.id
      );
    }
    return null;
  };

  const getShortLabel = (id: string): string =>
    rotationActions.find((action) => action.id === id)?.shortLabel ?? id;

  const toAutomaticStep = (action: KitAction): RotationStep | null => {
    const id =
      action.kind === 'cast'
        ? action.stepId ?? action.id
        : action.kind === 'normal' || action.kind === 'charged'
        ? action.kind
        : null;
    const rotationAction = rotationActions.find((entry) => entry.id === id);
    if (!rotationAction) {
      return null;
    }
    return {
      blockUid: '',
      action: rotationAction.id,
      kind: rotationAction.kind,
      seconds: 0,
    };
  };

  const getWarning = (
    step: RotationStep,
    planned: PlannedStep<KitAction>,
    waitedFrames: number
  ): string | null => {
    if (planned.action.kind === 'skipped') {
      return planned.action.reason;
    }
    if (planned.action.kind === 'cast' && planned.action.quickLocked) {
      return 'Charge cancel locked out: the spin was let go at a locked angle, the next Charged Attack waits the full dash';
    }
    if (planned.action.kind === 'cast' && planned.action.held?.cancel) {
      return 'Cancelled by the next action: no Final hit';
    }
    if (waitedFrames > 0) {
      const waitedFor =
        waitedForForm.get(planned) ?? getLabel(step, planned.action);
      return `Waited ${formatNumber(
        toSeconds(waitedFrames)
      )} s for the ${waitedFor} cooldown`;
    }
    const warning = character.actionWarnings.find(
      (entry) =>
        entry.action === step.action &&
        !runtime.evaluate(entry.unless, planned.startFrame)
    );
    return warning?.message ?? null;
  };

  const getLabel = (step: RotationStep, action: KitAction): string => {
    // A one-hit "combo" (Mualani's bite) reads as its action.
    if (action.kind === 'normal' && combos[action.comboId].length > 1) {
      const prefix =
        action.comboId === 'normal'
          ? 'N'
          : actions[action.comboId]?.shortLabel ?? action.comboId;
      return `${prefix}${action.index + 1}`;
    }
    if (action.kind === 'wait') {
      return `Wait ${formatNumber(step.seconds)} s`;
    }
    if (action.kind === 'cast' && action.stepId) {
      return actions[action.id]?.shortLabel ?? action.id;
    }
    return getShortLabel(step.action);
  };

  // Starts (or, when deferred, holds) the action's cooldown as it starts.
  const startCooldownOf = (id: string, startFrame: number) => {
    const cooldown = actions[id]?.cooldown;
    if (!cooldown) {
      return;
    }
    const cooldownId = runtime.getCooldownId(id);
    if (cooldown.deferred) {
      runtime.holdCooldown(cooldownId, startFrame);
      return;
    }
    runtime.startCooldown(
      cooldownId,
      startFrame,
      startFrame + cooldown.delayFrames + cooldown.frames
    );
  };

  // The action performed when it is not the step's own (a bite, a form).
  const getPerformedAction = (action: KitAction): string | undefined => {
    if (action.kind === 'cast' && action.stepId) {
      return action.id;
    }
    if (action.kind === 'normal' && action.comboId !== 'normal') {
      return action.comboId;
    }
    return undefined;
  };

  const perform: RotationAdapter<KitAction>['perform'] = (planned, entry) => {
    const { action, startFrame } = planned;
    const scheduledFrames: number[] = [];
    const schedule = (frame: number, run: (frame: number) => void) => {
      scheduledFrames.push(frame);
      runtime.queue.push(frame, run);
    };
    const scheduleHit = (
      frame: number,
      actionId: string,
      category: string,
      row: string,
      element: DamageElement,
      group?: string,
      gauge?: number,
      icd?: string,
      icdGroup?: string
    ) =>
      schedule(frame, (hitFrame) =>
        runtime.performHit({
          frame: hitFrame,
          category,
          element,
          scaling: runtime.rowScaling(row),
          actionId,
          group,
          row,
          gauge,
          icd,
          icdGroup,
          entry,
        })
      );

    // A step skipped (no Energy, a failed requirement) was not used.
    if (action.kind !== 'skipped') {
      runtime.logEvent(
        'action.use',
        startFrame,
        getActionId(action) ?? action.kind,
        {
          kind: action.kind,
          blockUid: entry?.blockUid ?? null,
        },
        entry?.blockUid ? causeId(entry) : null
      );
    }
    const actionId = getActionId(action);
    if (actionId) {
      startCooldownOf(actionId, startFrame);
    }

    if (action.kind === 'normal') {
      // A form's combo also counts (and triggers) as a Normal Attack.
      const { comboId } = action;
      const group = actions[comboId]?.group ?? 'normal';
      const keys = Array.from(new Set([comboId, group]));
      keys.forEach((key) => runtime.count(`uses:${key}`));
      runtime.fireTriggers('use', keys, startFrame, entry);
      runtime.shareUse([...keys, 'normal'], startFrame);
      getStep(action)?.hits.forEach((hit) =>
        scheduleHit(
          startFrame + hit.frame,
          comboId,
          hit.category ?? 'Normal',
          hit.row,
          (hit.element ?? 'Physical') as DamageElement,
          comboId === 'normal' ? undefined : group,
          hit.gauge,
          hit.icd,
          hit.icdGroup
        )
      );
    }
    if (action.kind === 'charged' && charged) {
      runtime.count('uses:charged');
      runtime.fireTriggers('use', ['charged'], startFrame, entry);
      runtime.shareUse(['charged'], startFrame);
      // Named moments first, so they run before a hit on the same frame.
      Object.entries(charged.events ?? {}).forEach(([name, frame]) =>
        schedule(startFrame + frame - action.windup, (eventFrame) =>
          runtime.fireTriggers('event', [`charged/${name}`], eventFrame, entry)
        )
      );
      charged.hits?.forEach((hit) =>
        scheduleHit(
          startFrame + hit.frame - action.windup,
          'charged',
          hit.category ?? 'Charged',
          hit.row,
          (hit.element ?? 'Physical') as DamageElement,
          undefined,
          hit.gauge,
          hit.icd,
          hit.icdGroup
        )
      );
    }
    if (action.kind === 'cast') {
      const cast = castOf(action);
      // A hold E also counts (and triggers) as an E.
      const keys = Array.from(new Set([action.id, cast.group]));
      keys.forEach((key) => runtime.count(`uses:${key}`));
      runtime.spendEnergy(action.id, startFrame);
      runtime.fireTriggers('use', keys, startFrame, entry);
      // Teammates see it by its kind too: Kablam is a Q.
      runtime.shareUse(Array.from(new Set([...keys, cast.kind])), startFrame);
      // A cancelled hold: `<id>/cancel` at the release (its Final hit,
      // which would clean up after it, never comes).
      if (action.held?.cancel) {
        const { frames } = action.held;
        schedule(startFrame + frames, (eventFrame) =>
          runtime.fireTriggers(
            'event',
            [`${action.id}/cancel`],
            eventFrame,
            entry
          )
        );
      }
      cast.hits?.forEach((hit) =>
        scheduleHit(
          startFrame + hit.frame,
          action.id,
          hit.category ?? cast.category,
          hit.row,
          (hit.element ??
            (PHYSICAL_KINDS.has(cast.kind)
              ? 'Physical'
              : character.element)) as DamageElement,
          cast.group,
          hit.gauge,
          hit.icd,
          hit.icdGroup
        )
      );
    }

    // Its events run as planning advances time: up to where the next action
    // starts (`settle`), so a hit after a cancel lands after that start.
  };

  const getSwapFrame = (previous: KitAction, previousStart: number): number => {
    const swap = getCancels(previous)?.swap;
    const windup = previous.kind === 'charged' ? previous.windup : 0;
    return (
      previousStart +
      (swap === undefined ? getEnd(previous) : Math.max(0, swap - windup))
    );
  };

  return {
    initialAction: { kind: 'start' },
    getSwapFrame,
    planStep,
    planAutomatic,
    toAutomaticStep,
    describe: (step, planned, waitedFrames) => ({
      label: getLabel(step, planned.action),
      comboIndex:
        planned.action.kind === 'normal' ? planned.action.index : null,
      endFrame: planned.startFrame + getEnd(planned.action),
      warning: getWarning(step, planned, waitedFrames),
      performedAction: getPerformedAction(planned.action),
      skipped: planned.action.kind === 'skipped',
    }),
    perform,
    // Skipped steps and actions cast during the previous one take no time.
    isOverlapping: (action) =>
      action.kind === 'skipped' || castsDuringPrevious(action),
  };
};
