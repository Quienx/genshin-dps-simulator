import {
  commonActionsSchema,
  RotationAction,
  RotationData,
  SequenceStep,
} from './rotationSchema';
import {
  RotationBlock,
  RotationSetting,
  RotationStep,
  RotationTraceEntry,
} from './types';
import commonActionsJson from '../../_data/actions/common.json';

const COMMON_ACTIONS = commonActionsSchema.parse(commonActionsJson).actions;

// Character actions first, then the shared Dodge / Wait. A character file can
// override a common action by declaring one with the same id.
export const getRotationActions = (data: RotationData): RotationAction[] => [
  ...data.actions,
  ...COMMON_ACTIONS.filter(
    (common) => !data.actions.some((action) => action.id === common.id)
  ),
];

export const findAction = (
  actions: RotationAction[],
  id: string
): RotationAction | undefined => actions.find((action) => action.id === id);

let nextUid = 0;
const createUid = (actionId: string): string => {
  nextUid += 1;
  return `${actionId}-${nextUid}`;
};

type BlockDraft = Omit<RotationBlock, 'uid'>;

export const createBlock = (action: RotationAction): RotationBlock => ({
  uid: createUid(action.id),
  action: action.id,
  hits: action.maxHits ?? 1,
  repeat: 1,
  seconds: action.defaultSeconds ?? 1,
  dashCancel: false,
});

const toStepSpec = (step: SequenceStep) =>
  typeof step === 'string' ? { action: step } : step;

export const getBlockTitle = (
  block: RotationBlock,
  action: RotationAction
): string => {
  if (action.steps && action.hitsLabel) {
    return `${action.label} (${block.hits} ${action.hitsLabel})`;
  }
  if (block.hold && action.hold) {
    return `${action.label} (Hold)`;
  }
  if (action.count?.hold) {
    const frames = heldFramesOf(block, action.count.hold);
    return `${action.label} (${(frames / 60).toFixed(2)} s, ${chargesIn(
      frames,
      action.count.hold
    )} charges)`;
  }
  if (action.count && block.hits > 1) {
    return `${action.label} (${block.hits} ${action.count.label})`;
  }
  if (action.kind !== 'normal' || (action.maxHits ?? 1) <= 1) {
    return action.label;
  }
  return `${action.label} ×${block.hits}`;
};

// A run of Normal Attack presses is split into blocks of at most one full
// combo; the combo index still carries over from one block to the next.
const chunkNormalRun = (
  action: RotationAction,
  presses: number
): BlockDraft[] => {
  const maxHits = action.maxHits ?? 1;
  return Array.from({ length: Math.ceil(presses / maxHits) }, (_, index) => ({
    action: action.id,
    hits: Math.min(maxHits, presses - index * maxHits),
    repeat: 1,
    seconds: 1,
    dashCancel: false,
  }));
};

const isSameDraft = (first: BlockDraft, second: BlockDraft): boolean =>
  first.action === second.action &&
  first.hits === second.hits &&
  first.seconds === second.seconds &&
  first.dashCancel === second.dashCancel &&
  Boolean(first.hold) === Boolean(second.hold);

// Same blocks in a row become one with a repeat; sequences stay one block
// per play, so each Surging Bite is its own piece.
const mergeRepeats = (
  drafts: BlockDraft[],
  keepApart: Set<string>
): BlockDraft[] =>
  drafts.reduce<BlockDraft[]>((merged, draft) => {
    const last = merged[merged.length - 1];
    if (last && !keepApart.has(draft.action) && isSameDraft(last, draft)) {
      return [...merged.slice(0, -1), { ...last, repeat: last.repeat + 1 }];
    }
    return [...merged, { ...draft }];
  }, []);

const traceToDrafts = (
  trace: RotationTraceEntry[],
  actions: RotationAction[]
): BlockDraft[] => {
  const drafts: BlockDraft[] = [];
  let runAction: RotationAction | null = null;
  let runPresses = 0;

  const flushRun = () => {
    if (runAction && runPresses > 0) {
      drafts.push(...chunkNormalRun(runAction, runPresses));
    }
    runAction = null;
    runPresses = 0;
  };

  // A run of actions that is a sequence's steps becomes that one block
  // (surfs into the enemy and a bite: a Surging Bite with that many).
  const sequences = actions.filter((action) => action.steps);
  const matchSequence = (from: number) => {
    for (const sequence of sequences) {
      let at = from;
      let hits: number | null = null;
      const matched = (sequence.steps ?? []).every((step) => {
        const spec = toStepSpec(step);
        if (spec.times === 'hits') {
          const max = sequence.maxHits ?? Number.POSITIVE_INFINITY;
          let count = 0;
          while (count < max && trace[at]?.action === spec.action) {
            count += 1;
            at += 1;
          }
          hits = count;
          return count >= (sequence.minHits ?? 0);
        }
        const entry = trace[at];
        if (
          !entry ||
          entry.action !== spec.action ||
          (spec.performed !== undefined &&
            ![spec.performed].flat().includes(entry.performedAction ?? ''))
        ) {
          return false;
        }
        at += 1;
        return true;
      });
      if (matched && at > from) {
        return { sequence, length: at - from, hits: hits ?? 1 };
      }
    }
    return null;
  };

  for (let index = 0; index < trace.length; index++) {
    const entry = trace[index];
    const match = matchSequence(index);
    if (match) {
      flushRun();
      drafts.push({
        action: match.sequence.id,
        hits: match.hits,
        repeat: 1,
        seconds: 1,
        dashCancel: false,
      });
      index += match.length - 1;
      continue;
    }
    // A hold (a hold E) is its action's block with Hold on.
    const holder = actions.find((other) => other.hold === entry.action);
    if (holder) {
      flushRun();
      drafts.push({
        action: holder.id,
        hits: 1,
        repeat: 1,
        seconds: 1,
        dashCancel: false,
        hold: true,
      });
      continue;
    }
    const action = findAction(actions, entry.action);
    if (!action) {
      continue;
    }
    if (action.kind === 'normal') {
      if (runAction && runAction.id !== action.id) {
        flushRun();
      }
      runAction = action;
      runPresses += 1;
      continue;
    }
    if (action.kind === 'dodge' && runAction) {
      flushRun();
      drafts[drafts.length - 1].dashCancel = true;
      continue;
    }
    flushRun();
    drafts.push({
      action: action.id,
      hits: 1,
      repeat: 1,
      seconds: entry.seconds || action.defaultSeconds || 1,
      dashCancel: false,
    });
  }
  flushRun();
  return drafts;
};

// Turns the actions a simulation performed back into editable blocks. The
// uids depend only on position, so server and client render the same list.
export const traceToRotation = (
  trace: RotationTraceEntry[],
  actions: RotationAction[]
): RotationSetting => ({
  loop: false,
  blocks: mergeRepeats(
    traceToDrafts(trace, actions),
    new Set(actions.filter((action) => action.steps).map((action) => action.id))
  ).map((draft, index) => ({
    ...draft,
    uid: `auto-${index}`,
  })),
});

// Inserts before `beforeUid`, or at the end when it is null or unknown.
export const insertBlock = (
  setting: RotationSetting,
  block: RotationBlock,
  beforeUid: string | null
): RotationSetting => {
  const index = setting.blocks.findIndex((entry) => entry.uid === beforeUid);
  if (index < 0) {
    return { ...setting, blocks: [...setting.blocks, block] };
  }
  return {
    ...setting,
    blocks: [
      ...setting.blocks.slice(0, index),
      block,
      ...setting.blocks.slice(index),
    ],
  };
};

export const removeBlock = (
  setting: RotationSetting,
  uid: string
): RotationSetting => ({
  ...setting,
  blocks: setting.blocks.filter((block) => block.uid !== uid),
});

// Several blocks at once (a multi-selection deleted).
export const removeBlocks = (
  setting: RotationSetting,
  uids: string[]
): RotationSetting => {
  const gone = new Set(uids);
  return {
    ...setting,
    blocks: setting.blocks.filter((block) => !gone.has(block.uid)),
  };
};

// The blocks from one to another, both included, in rotation order
// (Shift + click in edit mode). An unknown uid: just the other one.
export const selectRange = (
  setting: RotationSetting,
  fromUid: string | null,
  toUid: string
): string[] => {
  const uids = setting.blocks.map((block) => block.uid);
  const to = uids.indexOf(toUid);
  const from = fromUid === null ? -1 : uids.indexOf(fromUid);
  if (to < 0) {
    return [];
  }
  if (from < 0) {
    return [toUid];
  }
  return uids.slice(Math.min(from, to), Math.max(from, to) + 1);
};

// The shortest hold a block allows: shorter with no Final hit, when the
// action says so (Mavuika's spin, dashed out before its first hit).
export const minHeldFramesOf = (
  block: Pick<RotationBlock, 'noFinal'>,
  hold: NonNullable<NonNullable<RotationAction['count']>['hold']>
): number =>
  block.noFinal ? hold.cancelMinFrames ?? hold.minFrames : hold.minFrames;

// How many frames a held action's block holds it: its hold time, else
// its spins (`releaseFrame` + one spin per extra count), within what the
// action allows.
export const heldFramesOf = (
  block: Pick<RotationBlock, 'hits' | 'heldSeconds' | 'noFinal'>,
  hold: NonNullable<NonNullable<RotationAction['count']>['hold']>
): number => {
  const frames =
    block.heldSeconds === undefined
      ? hold.releaseFrame + (Math.max(1, block.hits) - 1) * hold.everyFrames
      : Math.round(block.heldSeconds * 60);
  return Math.min(
    hold.maxFrames,
    Math.max(minHeldFramesOf(block, hold), frames)
  );
};

// How many repeated hits (charges) a hold of `frames` gets.
export const chargesIn = (
  frames: number,
  hold: Pick<
    NonNullable<NonNullable<RotationAction['count']>['hold']>,
    'firstHitFrame' | 'hitEveryFrames'
  >
): number =>
  frames < hold.firstHitFrame
    ? 0
    : Math.floor((frames - hold.firstHitFrame) / hold.hitEveryFrames) + 1;

// Whether `next` cancels a held block at its release (it is one of its
// `cancelledBy`: a Dash after Mavuika's spin). Nothing that does: the
// game plays its Final hit.
export const cancelsHold = (
  block: Pick<RotationBlock, 'action'>,
  next: Pick<RotationBlock, 'action'> | undefined,
  actions: RotationAction[]
): boolean => {
  const cancelledBy = findAction(actions, block.action)?.count?.hold
    ?.cancelledBy;
  if (!next || !cancelledBy) {
    return false;
  }
  const nextAction = findAction(actions, next.action);
  const nextId = next.action.split(':').pop() ?? next.action;
  return (
    cancelledBy.includes(nextId) ||
    Boolean(nextAction && cancelledBy.includes(nextAction.kind))
  );
};

// A held block as it plays: its Final hit off only while the block after
// it cancels it (the toggle is kept for when one comes back).
export const playedHold = (
  block: RotationBlock,
  next: RotationBlock | undefined,
  actions: RotationAction[]
): RotationBlock =>
  block.noFinal && !cancelsHold(block, next, actions)
    ? { ...block, noFinal: false }
    : block;

// Held blocks with a block they are `cancelledBy` (a Dash) right after
// lose their Final hit: when such a block is dropped (only the one before
// the `uid`s given), or for a whole preset rotation (no `uids`).
export const cancelHoldsBefore = (
  setting: RotationSetting,
  actions: RotationAction[],
  uids?: string[]
): RotationSetting => {
  const blocks = setting.blocks.map((block, index) => {
    const next = setting.blocks[index + 1];
    if (!next || (uids && !uids.includes(next.uid))) {
      return block;
    }
    return cancelsHold(block, next, actions)
      ? { ...block, noFinal: true }
      : block;
  });
  return blocks.every((block, index) => block === setting.blocks[index])
    ? setting
    : { ...setting, blocks };
};

export const updateBlock = (
  setting: RotationSetting,
  uid: string,
  patch: Partial<
    Pick<
      RotationBlock,
      | 'hits'
      | 'repeat'
      | 'seconds'
      | 'dashCancel'
      | 'hold'
      | 'heldSeconds'
      | 'noFinal'
    >
  >
): RotationSetting => ({
  ...setting,
  blocks: setting.blocks.map((block) =>
    block.uid === uid ? { ...block, ...patch } : block
  ),
});

export const moveBlock = (
  setting: RotationSetting,
  fromUid: string,
  toUid: string
): RotationSetting => {
  const from = setting.blocks.findIndex((block) => block.uid === fromUid);
  const to = setting.blocks.findIndex((block) => block.uid === toUid);
  if (from < 0 || to < 0 || from === to) {
    return setting;
  }
  const blocks = [...setting.blocks];
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return { ...setting, blocks };
};

export const setLoop = (
  setting: RotationSetting,
  loop: boolean
): RotationSetting => ({ ...setting, loop });

const toStep = (
  block: RotationBlock,
  action: RotationAction
): RotationStep => ({
  blockUid: block.uid,
  action: action.id,
  kind: action.kind,
  seconds: block.seconds,
});

const expandRepetition = (
  block: RotationBlock,
  action: RotationAction,
  dodge: RotationAction | undefined,
  actions: RotationAction[]
): RotationStep[] => {
  if (action.steps) {
    return action.steps.flatMap((step) => {
      const spec = toStepSpec(step);
      const stepAction = findAction(actions, spec.action);
      if (!stepAction) {
        return [];
      }
      const times = spec.times === 'hits' ? Math.max(0, block.hits) : 1;
      return Array.from({ length: times }, () => toStep(block, stepAction));
    });
  }
  if (action.kind !== 'normal') {
    const hold = block.hold && action.hold && findAction(actions, action.hold);
    const step = toStep(block, hold || action);
    if (!action.count) {
      return [step];
    }
    const count = Math.max(1, block.hits);
    const held = action.count.hold;
    return [
      held
        ? {
            ...step,
            count,
            held: {
              frames: heldFramesOf(block, held),
              // No Final: cancelled at the release, but not at the cap,
              // where the game forces it.
              ...(block.noFinal && heldFramesOf(block, held) < held.maxFrames
                ? { cancel: true }
                : {}),
            },
          }
        : { ...step, count },
    ];
  }
  const presses = Array.from({ length: Math.max(1, block.hits) }, () =>
    toStep(block, action)
  );
  if (!block.dashCancel || !dodge) {
    return presses;
  }
  return [...presses, toStep(block, dodge)];
};

// Flattens the blocks into single actions: "Normal ×5 + Dash, repeat 2"
// becomes N1–N5, Dash, N1–N5, Dash.
export const expandBlocks = (
  setting: RotationSetting,
  actions: RotationAction[]
): RotationStep[] => {
  const dodge = actions.find((action) => action.kind === 'dodge');
  return setting.blocks.flatMap((stored, index) => {
    const action = findAction(actions, stored.action);
    if (!action) {
      return [];
    }
    const block = playedHold(stored, setting.blocks[index + 1], actions);
    const repetition = expandRepetition(block, action, dodge, actions).map(
      (step) => ({ ...step, blockAction: block.action })
    );
    return Array.from(
      { length: Math.max(1, block.repeat) },
      () => repetition
    ).flat();
  });
};

// Combo positions each block actually played (0 = N1), in order. The combo
// carries over between blocks, so a block can start at N5 and wrap to N1.
export const getComboIndexesByBlock = (
  trace: RotationTraceEntry[]
): Record<string, number[]> =>
  trace.reduce<Record<string, number[]>>((combos, entry) => {
    if (entry.comboIndex === null) {
      return combos;
    }
    return {
      ...combos,
      [entry.blockUid]: [...(combos[entry.blockUid] ?? []), entry.comboIndex],
    };
  }, {});

// Last note each block produced: for a sequence, its final step's (the
// Wave Momentum a bite had).
export const getLastByBlock = (
  trace: RotationTraceEntry[],
  field: 'warning' | 'note'
): Record<string, string> =>
  trace.reduce<Record<string, string>>((found, entry) => {
    const value = entry[field];
    return value ? { ...found, [entry.blockUid]: value } : found;
  }, {});

// First warning (or note) each block produced, shown on its timeline piece.
export const getFirstByBlock = (
  trace: RotationTraceEntry[],
  field: 'warning' | 'note'
): Record<string, string> =>
  trace.reduce<Record<string, string>>((found, entry) => {
    const value = entry[field];
    if (value && !found[entry.blockUid]) {
      return { ...found, [entry.blockUid]: value };
    }
    return found;
  }, {});
