import { expandBlocks } from './blocks';
import { RotationAction } from './rotationSchema';
import { createSequenceCursor } from './sequenceCursor';
import { RotationSetting, RotationStep, RotationTraceEntry } from './types';
import { FRAMES_PER_SECOND } from '../frames';

// One action the character is about to perform. `earliestFrame` is when it
// could have started; the gap up to `startFrame` is time spent waiting (a
// cooldown, for example) and is reported in the trace.
export type PlannedStep<A> = {
  action: A;
  startFrame: number;
  earliestFrame: number;
};

type StepDescription = {
  label: string;
  // Normal Attack combo position (0 = N1), null for other actions.
  comboIndex: number | null;
  // When the next action could start, for the timeline width.
  endFrame: number;
  warning: string | null;
  // The action actually performed, if not the step's own.
  performedAction?: string;
  // Who did it, if not who the step names: a team's Dash or Wait is done by
  // the member on the field (its team action id, "nicole:dodge").
  action?: string;
  // Not performed (no Energy, a failed requirement).
  skipped?: boolean;
};

// What a character supplies so the shared player can drive it. `A` is the
// character's own action type, carrying whatever its frame data needs.
export type RotationAdapter<A> = {
  initialAction: A;
  // Custom rotation: when and how this step can be performed. Null skips the
  // step (the character cannot perform it at all).
  planStep: (
    step: RotationStep,
    previous: A,
    previousStart: number
  ) => PlannedStep<A> | null;
  // Automatic rotation: the character's own priority logic.
  planAutomatic: (previous: A, previousStart: number) => PlannedStep<A> | null;
  // The rotation step an automatically picked action corresponds to, so the
  // editor can show it as a block.
  toAutomaticStep: (action: A) => RotationStep | null;
  describe: (
    step: RotationStep,
    planned: PlannedStep<A>,
    waitedFrames: number
  ) => StepDescription;
  // Performs the action: schedules and runs its hits. `entry` is its trace
  // entry (null past the end) so outcomes known only now can be noted.
  perform: (planned: PlannedStep<A>, entry: RotationTraceEntry | null) => void;
  // Actions that take no time of their own (e.g. a burst cast during another
  // action): the next action is timed from the one before them.
  isOverlapping?: (action: A) => boolean;
  // Something to do before a custom step that is not ready yet (a team's
  // member on the field attacking while the next member's E recharges).
  // The step is planned again after it.
  planFiller?: (
    step: RotationStep,
    previous: A,
    previousStart: number
  ) => PlannedStep<A> | null;
};

type PlayOptions = {
  rotation: RotationSetting | null;
  actions: RotationAction[];
  durationFrames: number;
  // Told when the run ended before the rotation did (a step left that
  // would start past the duration).
  onCutShort?: () => void;
};

const toSeconds = (frames: number): number => frames / FRAMES_PER_SECOND;

const MIN_STALL_ALLOWANCE = 8;

export const playRotation = <A>(
  adapter: RotationAdapter<A>,
  { rotation, actions, durationFrames, onCutShort }: PlayOptions
): RotationTraceEntry[] => {
  const trace: RotationTraceEntry[] = [];
  const steps = rotation ? expandBlocks(rotation, actions) : [];
  const cursor = rotation ? createSequenceCursor(steps, rotation.loop) : null;
  let previous = adapter.initialAction;
  let previousStart = 0;

  const record = (
    step: RotationStep | null,
    planned: PlannedStep<A>
  ): RotationTraceEntry | null => {
    if (!step || planned.startFrame >= durationFrames) {
      return null;
    }
    const waitedFrames = Math.max(
      0,
      planned.startFrame - planned.earliestFrame
    );
    const description = adapter.describe(step, planned, waitedFrames);
    const entry: RotationTraceEntry = {
      blockUid: step.blockUid,
      action: description.action ?? step.action,
      kind: step.kind,
      seconds: step.seconds,
      comboIndex: description.comboIndex,
      label: description.label,
      startTime: toSeconds(planned.startFrame),
      endTime: toSeconds(description.endFrame),
      waitedSeconds: toSeconds(waitedFrames),
      warning: description.warning,
      note: null,
      performedAction: description.performedAction,
      blockAction: step.blockAction,
      skipped: description.skipped ?? false,
    };
    trace.push(entry);
    return entry;
  };

  // A step a filler went before: it is planned again next.
  let pending: RotationStep | null = null;

  const planFromRotation = (): {
    step: RotationStep | null;
    planned: PlannedStep<A>;
  } | null => {
    if (!cursor) {
      return null;
    }
    // Steps the character cannot perform are skipped; a full pass of them
    // ends the rotation.
    for (let skipped = 0; skipped <= steps.length; skipped++) {
      const step = pending ?? cursor.next();
      pending = null;
      if (!step) {
        return null;
      }
      const filler = adapter.planFiller?.(step, previous, previousStart);
      if (filler) {
        pending = step;
        return {
          step: adapter.toAutomaticStep(filler.action),
          planned: filler,
        };
      }
      const planned = adapter.planStep(step, previous, previousStart);
      if (planned) {
        return { step, planned };
      }
    }
    return null;
  };

  // Each automatic play is its own step, with an id of its own (as a
  // rotation block has), so its hits and what they made are tied to it.
  let automaticPlays = 0;
  const planNext = () => {
    if (cursor) {
      return planFromRotation();
    }
    const planned = adapter.planAutomatic(previous, previousStart);
    if (!planned) {
      return null;
    }
    const step = adapter.toAutomaticStep(planned.action);
    automaticPlays += 1;
    return {
      step: step && { ...step, blockUid: `automatic-${automaticPlays}` },
      planned,
    };
  };

  // Every real action moves time forward; a run of steps that does not (only
  // overlapping actions, or ones stuck on the same frame) would loop
  // forever, so it ends the play.
  const maxStalledSteps = Math.max(steps.length, MIN_STALL_ALLOWANCE) + 1;
  let lastAdvancedFrame = -1;
  let stalledSteps = 0;
  // The last entry that took time: a cancel into the next action cuts it
  // short, so its end becomes the next action's start.
  let lastTimed: RotationTraceEntry | null = null;
  for (;;) {
    const next = planNext();
    if (!next || next.planned.startFrame >= durationFrames) {
      if (next) {
        onCutShort?.();
      }
      break;
    }
    const { step, planned } = next;
    const entry = record(step, planned);
    adapter.perform(planned, entry);

    const overlaps = adapter.isOverlapping?.(planned.action) ?? false;
    if (entry && !overlaps) {
      if (lastTimed && lastTimed.endTime > entry.startTime) {
        lastTimed.endTime = entry.startTime;
      }
      lastTimed = entry;
    }
    if (!overlaps && planned.startFrame > lastAdvancedFrame) {
      lastAdvancedFrame = planned.startFrame;
      stalledSteps = 0;
    } else {
      stalledSteps += 1;
    }
    if (stalledSteps > maxStalledSteps) {
      break;
    }
    if (!overlaps) {
      previous = planned.action;
      previousStart = planned.startFrame;
    }
  }
  return trace;
};
