/* eslint-disable @typescript-eslint/no-explicit-any -- reads systems params and ops as loose records */
import { getLoadedCharacter } from '../../_lib/characterData';
import {
  ActionPiece,
  BlockChip,
  EnemyHit,
  InspectorView,
} from '../../_lib/inspector';
import { insertBlock, removeBlock } from '../../_lib/rotation/blocks';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { RotationBlock, RotationSetting } from '../../_lib/rotation/types';
import {
  createTeamBlock,
  getCharacterState,
  stampFieldActions,
  TeamMemberRun,
} from '../../_lib/team';

// An action's name without its owner ("Arlecchino: …"); a Normal Attack
// with its place in the combo ("Normal Attack · N3"), a whole combo with
// its first and last ("Normal Attack · N1–N6").
export const actionTitle = (
  action: Pick<ActionPiece, 'label' | 'comboIndex'> & {
    parts?: Pick<ActionPiece, 'comboIndex'>[];
  },
  rotationAction: { label: string } | undefined
): string => {
  const name = (rotationAction?.label ?? action.label).replace(
    /^[^:]+:\s*/,
    ''
  );
  if (!rotationAction || action.comboIndex === null) {
    return name;
  }
  const last = action.parts?.at(-1)?.comboIndex ?? action.comboIndex;
  return last !== action.comboIndex
    ? `${name} · N${action.comboIndex + 1}–N${last + 1}`
    : `${name} · N${action.comboIndex + 1}`;
};

// An action as the chart draws it: one press, or a whole Normal Attack
// combo (its presses are its parts).
export type ActionGroup = ActionPiece & { parts: ActionPiece[] };

// The Normal Attack presses of one combo (N1, N2… one right after the
// other, same member and action) as one block, from its first press to
// its last; every other action on its own. `byBlock` (edit mode): only
// presses of one rotation block, so each block is one of the rotation's.
export const groupNormalCombos = (
  actions: ActionPiece[],
  { byBlock = false }: { byBlock?: boolean } = {}
): ActionGroup[] => {
  const groups: ActionGroup[] = [];
  [...actions]
    .sort((first, second) => first.start - second.start)
    .forEach((action) => {
      const group = groups.at(-1);
      const last = group?.parts.at(-1);
      if (
        group &&
        last &&
        action.comboIndex !== null &&
        last.comboIndex !== null &&
        action.comboIndex === last.comboIndex + 1 &&
        action.characterId === last.characterId &&
        action.actionId === last.actionId &&
        (!byBlock || action.blockUid === last.blockUid)
      ) {
        group.parts.push(action);
        group.end = action.end;
        return;
      }
      groups.push({ ...action, parts: [action] });
    });
  return groups;
};

// Edit mode's drag and drop: a palette action to add, or a block of the
// rotation to move (or drop on the trash).
export type DragPayload =
  | { kind: 'new'; actionId: string }
  | { kind: 'move'; blockUid: string };

// Edit mode: the rotation block a drop at `time` goes before, the first
// whose middle is past it (null: at the end). A block's wait for its
// cooldown is part of it: it starts where it was put.
export const dropBefore = (
  groups: (Pick<ActionGroup, 'blockUid' | 'start' | 'end'> & {
    waited?: number;
  })[],
  time: number
): string | null =>
  [...groups]
    .sort((first, second) => first.start - second.start)
    .find((group) => (group.start - (group.waited ?? 0) + group.end) / 2 > time)
    ?.blockUid ?? null;

// Where a drop at `time` lands: the block it goes before, and the moment
// of that slot on the chart (where that block starts, its wait included;
// past the last block, where it ends). The placeholder is drawn there.
export const dropSlot = (
  groups: (Pick<ActionGroup, 'blockUid' | 'start' | 'end'> & {
    waited?: number;
  })[],
  time: number
): { beforeUid: string | null; time: number } => {
  const beforeUid = dropBefore(groups, time);
  const before = groups.find((group) => group.blockUid === beforeUid);
  return {
    beforeUid,
    time: before
      ? before.start - (before.waited ?? 0)
      : Math.max(0, ...groups.map((group) => group.end)),
  };
};

// A new block of a palette action: a Normal Attack as its whole combo.
export const blockFor = (action: RotationAction): RotationBlock => ({
  ...createTeamBlock(
    action.id,
    action.kind === 'normal' ? action.maxHits ?? 1 : 1
  ),
  seconds: action.defaultSeconds ?? 1,
});

// A drop before `beforeUid` (null: at the end): a palette action becomes a
// new block there (picked), or a block moves there. Dropped on its own
// place, nothing changes. Dash and Wait blocks then name the member on the
// field where they are (stampFieldActions).
export const applyDrop = (
  rotation: RotationSetting,
  actions: RotationAction[],
  payload: DragPayload,
  beforeUid: string | null
): { rotation: RotationSetting; selected: string | null } => {
  if (payload.kind === 'new') {
    const action = actions.find((entry) => entry.id === payload.actionId);
    if (!action) {
      return { rotation, selected: null };
    }
    const block = blockFor(action);
    return {
      rotation: stampFieldActions(insertBlock(rotation, block, beforeUid)),
      selected: block.uid,
    };
  }
  const index = rotation.blocks.findIndex(
    (block) => block.uid === payload.blockUid
  );
  const next = rotation.blocks[index + 1]?.uid ?? null;
  if (index < 0 || beforeUid === payload.blockUid || beforeUid === next) {
    return { rotation, selected: payload.blockUid };
  }
  return {
    rotation: stampFieldActions(
      insertBlock(
        removeBlock(rotation, payload.blockUid),
        rotation.blocks[index],
        beforeUid
      )
    ),
    selected: payload.blockUid,
  };
};

// The Selected Event at the playhead: the action playing, else the
// latest started. An action starts where its block does, its wait for a
// cooldown included (the grey stretch is its own).
export const actionAt = (actions: ActionPiece[], time: number) => {
  const now = time + 1e-6;
  const latest = [...actions].reverse();
  const begun = (action: ActionPiece) => action.start - action.waited <= now;
  return (
    latest.find((action) => begun(action) && time <= action.end + 1e-6) ??
    latest.find(begun)
  );
};

// The Selected Event's character state (cooldowns, Energy, Bond of
// Life): at the playhead, so cooldowns run down as it moves (an event
// pinned too); with what the event changed since it was used. The hit
// shown keeps its own stats in its breakdown.
export const eventCharacterState = (
  member: TeamMemberRun,
  action: ActionPiece,
  time: number
) => getCharacterState(member, time, action.start);

// Every hit of a block's presses.
export const hitsOfGroup = (view: InspectorView, group: ActionGroup) =>
  group.parts.flatMap((part) => hitsOfAction(view, part));

// A transformative reaction's own hit (Overloaded's explosion).
export const isReactionHit = (hit: EnemyHit) =>
  hit.reaction !== 'None' && hit.category === hit.reaction;

// Each action's own hits: from its start until the same step's next turn
// (a loop plays it again), as in the team inspector.
export const hitsOfAction = (view: InspectorView, action: ActionPiece) => {
  const nextTurn =
    view.actions.find(
      (other) =>
        other.blockUid === action.blockUid && other.start > action.start
    )?.start ?? Number.POSITIVE_INFINITY;
  return view.hits.filter(
    (hit) =>
      !isReactionHit(hit) &&
      hit.blockUid === action.blockUid &&
      hit.time >= action.start - 1e-6 &&
      hit.time < nextTurn
  );
};

// Every moment something happens in a run (an action starts, a hit lands,
// a block starts, ends or is renewed, a heal ticks), sorted: what a view
// shows only changes when the playhead crosses one.
export const eventTimes = (view: InspectorView): number[] => {
  const times: number[] = [];
  view.actions.forEach((action) => times.push(action.start, action.end));
  view.hits.forEach((hit) => times.push(hit.time));
  view.chips.forEach((chip) => {
    times.push(chip.start);
    if (chip.end !== null) {
      times.push(chip.end);
    }
    chip.renewals?.forEach((renewal) => times.push(renewal.start));
    chip.ticks?.forEach((tick) => times.push(tick));
  });
  return Array.from(new Set(times)).sort((a, b) => a - b);
};

// How many of the sorted `times` are at or before `time` (a binary
// search): a key that only changes when an event is crossed.
export const countUpTo = (times: number[], time: number): number => {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

// The panels redraw at most this often while the playhead moves (s).
export const PANEL_QUANTUM = 0.05;

// React.memo's check for a panel that follows the playhead: it redraws
// when another prop changes or the time moves past a quantum. Function
// props are callbacks that do the same thing on every render.
export const samePanelProps = <P extends { time: number }>(
  before: P,
  after: P
): boolean =>
  (Object.keys(after) as (keyof P)[]).every((key) =>
    key === 'time'
      ? Math.round(before.time / PANEL_QUANTUM) ===
        Math.round(after.time / PANEL_QUANTUM)
      : typeof after[key] === 'function' || Object.is(before[key], after[key])
  );

// The special systems' own resources and statuses (Nightsoul, Bond of
// Life): a mechanic that changes one of them belongs with the system.
const SYSTEM_IDS = new Set(['nightsoul', 'nightsoulBlessing', 'bondOfLife']);
const SYSTEM_OPS = [
  'setResource',
  'addResource',
  'multiplyResource',
  'applyStatus',
  'removeStatus',
] as const;

// Every block a character brings: their kit's, their weapon's and their
// set's (Crimson Moon's Semblance grants Bond of Life).
const blocksOf = (characterId: string) => {
  const { character } = getLoadedCharacter(characterId);
  return [
    ...character.blocks,
    ...character.weapon.blocks,
    ...character.artifactSet.blocks,
  ];
};

// A bonus' resource timer (`chip.meter`) at `time`: its value, how full
// the bar is (from the bound to the top, or down to the bound), and both
// in words ("130%", "≥ 30%").
type Meter = NonNullable<BlockChip['meter']>;
const formatMeter = (meter: Meter, value: number) =>
  `${Math.round(value * 10) / 10}${meter.format === 'percent' ? '%' : ''}`;
export const meterAt = (meter: Meter, time: number) => {
  let value = 0;
  meter.points.forEach((point) => {
    if (point.time <= time + 1e-6) {
      value = point.value;
    }
  });
  const { gt, gte, lt, lte } = meter.bounds;
  const low = gte ?? gt;
  const high = lte ?? lt;
  const top =
    meter.max ?? Math.max(...meter.points.map((point) => point.value));
  const share =
    low !== undefined
      ? (value - low) / Math.max(1e-6, top - low)
      : high !== undefined
      ? (high - value) / Math.max(1e-6, high)
      : 1;
  const bound = [
    gte !== undefined && `≥ ${formatMeter(meter, gte)}`,
    gt !== undefined && `> ${formatMeter(meter, gt)}`,
    lte !== undefined && `≤ ${formatMeter(meter, lte)}`,
    lt !== undefined && `< ${formatMeter(meter, lt)}`,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    value,
    text: formatMeter(meter, value),
    bound,
    share: Math.min(1, Math.max(0, share)),
  };
};

// A resource of a special system (Bond of Life, Nightsoul points).
export const isSystemResource = (id: string) => SYSTEM_IDS.has(id);

// A trigger whose ops change a special system.
const changesSystem = (block: { do: object[] }) =>
  block.do.some((op) =>
    SYSTEM_OPS.some((key) => {
      const target = (op as Record<string, unknown>)[key];
      return typeof target === 'string' && SYSTEM_IDS.has(target);
    })
  );

// Whether a block of a character file belongs to a special system: a
// trigger that changes it (Varesa's Fiery Plunge spends her Nightsoul
// points and ends the Blessing), or a status such a trigger depends on
// (Arlecchino's Directive decides how much Bond of Life she absorbs). Only
// what it does counts: a bonus that just reads the Blessing is a buff.
export const changesSpecialSystem = (
  characterId: string,
  blockId: string | undefined
): boolean => {
  if (!blockId) {
    return false;
  }
  const blocks = blocksOf(characterId);
  const block = blocks.find((entry) => entry.id === blockId);
  if (block?.type === 'trigger') {
    return changesSystem(block);
  }
  if (block?.type !== 'status') {
    return false;
  }
  // Read as a condition, an amount's `ifStatus`, a budget's `whileStatus`
  // or the status ending.
  const reference = new RegExp(
    `"(status|ifStatus|whileStatus|statusEnds)":"${blockId}"`
  );
  return blocks.some(
    (entry) =>
      entry.type === 'trigger' &&
      changesSystem(entry) &&
      reference.test(JSON.stringify(entry))
  );
};

// What a weapon, set or constellation does to a special system (Crimson
// Moon's Semblance granting Bond of Life): one Buffs & Debuffs row per
// block, a mark each time it fired. The kit's own changes show in the
// system's block.
export type SystemEventRow = {
  key: string;
  characterId: string;
  blockId: string;
  label: string;
  sourceTag: string;
  iconUrl: string | null;
  chips: BlockChip[];
};

export const systemEventRows = (view: InspectorView): SystemEventRow[] => {
  const rows = new Map<string, SystemEventRow>();
  view.chips
    .filter(
      (chip) =>
        chip.kind === 'trigger' &&
        !chip.hidden &&
        chip.source !== 'talent' &&
        chip.source !== 'passive' &&
        changesSpecialSystem(chip.characterId, chip.blockId)
    )
    .forEach((chip) => {
      const key = `${chip.characterId}|${chip.blockId}`;
      const row = rows.get(key) ?? {
        key,
        characterId: chip.characterId,
        blockId: chip.blockId ?? '',
        label: chip.label,
        sourceTag: chip.sourceTag,
        iconUrl: chip.iconUrl,
        chips: [],
      };
      row.chips.push(chip);
      rows.set(key, row);
    });
  return Array.from(rows.values());
};

// A trigger in words, from its own data (the engine only describes
// bonuses): when it fires and each thing it does, in order. For a block
// with no in-game text, such as Varesa's Fiery Plunge.
const FRAMES = 60;
const humanize = (id: string) =>
  id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (first) => first.toUpperCase());

export const describeTrigger = (
  characterId: string,
  blockId: string | undefined
): string[] => {
  if (!blockId) {
    return [];
  }
  const { character } = getLoadedCharacter(characterId);
  const blocks = blocksOf(characterId);
  const block = blocks.find((entry) => entry.id === blockId);
  if (!block || block.type !== 'trigger') {
    return [];
  }
  // A resource's or status' name: its block's label, the systems' own.
  const nightsoul = (character.systems as Record<string, any> | undefined)
    ?.nightsoul;
  const nameOf = (id: string): string => {
    if (id === 'nightsoul') return nightsoul?.label ?? 'Nightsoul points';
    if (id === 'nightsoulBlessing')
      return nightsoul?.blessing?.label ?? "Nightsoul's Blessing";
    if (id === 'energy') return 'Energy';
    if (id === 'bondOfLife') return 'Bond of Life';
    const found = blocks.find((entry) => entry.id === id);
    return found && 'label' in found && found.label
      ? String(found.label)
      : humanize(id);
  };
  const seconds = (frames: number) =>
    `${Math.round((frames / FRAMES) * 100) / 100} s`;
  const lines: string[] = [];

  const when = block.when as Record<string, unknown>;
  if (typeof when.use === 'string')
    lines.push(`When ${humanize(when.use)} is used:`);
  else if (typeof when.hit === 'string')
    lines.push(`On a ${humanize(String(when.hit).replace(/^.*\//, ''))} hit:`);
  else if (typeof when.statusEnds === 'string')
    lines.push(`When ${nameOf(when.statusEnds)} ends:`);
  else if (typeof when.resourceChanges === 'string')
    lines.push(`When ${nameOf(when.resourceChanges)} changes:`);
  else if (typeof when.heal === 'string') lines.push('On a heal:');
  else if (typeof when.event === 'string')
    lines.push(`On ${humanize(String(when.event).replace(/^.*\//, ''))}:`);

  block.do.forEach((raw) => {
    const op = raw as Record<string, any>;
    let what: string | null = null;
    if (op.setResource) what = `${nameOf(op.setResource)} set to ${op.value}`;
    else if (op.addResource) {
      const amount = op.amount;
      what =
        typeof amount === 'number'
          ? `${amount >= 0 ? '+' : ''}${amount} ${nameOf(op.addResource)}`
          : `${nameOf(op.addResource)} gained`;
    } else if (op.multiplyResource)
      what = `${nameOf(op.multiplyResource)} × ${op.by}`;
    else if (op.applyStatus) what = `Applies ${nameOf(op.applyStatus)}`;
    else if (op.removeStatus) what = `Ends ${nameOf(op.removeStatus)}`;
    else if (op.addStack) what = `+1 ${nameOf(op.addStack)} stack`;
    else if (op.hit) {
      const hit = op.hit as Record<string, any>;
      what = `Hit: ${
        hit.multiplier !== undefined
          ? `${hit.multiplier}% ATK`
          : hit.row
          ? humanize(String(hit.row).replace(/^.*\//, ''))
          : 'DMG'
      }${hit.element ? ` ${hit.element}` : ''}`;
    } else if (op.reactionHit) what = `${op.reactionHit} DMG`;
    else if (op.particles !== undefined) what = 'Makes Elemental Particles';
    else if (op.heal) what = 'Heals';
    else if (op.startCooldown)
      what = `Starts ${humanize(op.startCooldown)} cooldown`;
    else if (op.reduceCooldown)
      what = `Cuts ${humanize(op.reduceCooldown)} cooldown`;
    if (!what) return;
    const after = op.delayFrames ?? op.afterFrames ?? op.hit?.afterFrames;
    const extras = [
      typeof after === 'number' && after > 0 ? `after ${seconds(after)}` : null,
      typeof op.ifFlag === 'string'
        ? /^c[1-6]$/.test(op.ifFlag)
          ? `with ${op.ifFlag.toUpperCase()}`
          : 'if enabled'
        : null,
    ].filter(Boolean);
    lines.push(
      `• ${what}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`
    );
  });
  if (typeof block.icdFrames === 'number')
    lines.push(`Once every ${seconds(block.icdFrames)}.`);
  return lines.length > 1 ? lines : [];
};

// A special system's own state in words: the Nightsoul's Blessing (Fiery
// Passion for Varesa) comes from the nightsoul module, not the character
// file's blocks, so it has no text of its own. Its settings, the forms
// that replace her attacks and the bonuses it turns on, from her file.
const ACTION_TITLES: Record<string, string> = {
  normal: 'Normal Attack',
  charged: 'Charged Attack',
  plunge: 'Plunging Attack',
  skill: 'Elemental Skill',
  burst: 'Elemental Burst',
};

// A condition on a resource, in words: "at 30% or more", "above 0%".
const describeBounds = (
  bounds: { gt?: number; gte?: number; lt?: number; lte?: number },
  unit: string
): string =>
  [
    bounds.gte !== undefined && `at ${bounds.gte}${unit} or more`,
    bounds.gt !== undefined && `above ${bounds.gt}${unit}`,
    bounds.lte !== undefined && `at ${bounds.lte}${unit} or less`,
    bounds.lt !== undefined && `below ${bounds.lt}${unit}`,
  ]
    .filter(Boolean)
    .join(', ');

// An amount an op adds, in words: "+25%", "+65% or +130%".
const describeAmount = (amount: unknown, unit: string): string | null => {
  if (typeof amount === 'number') {
    return `${amount >= 0 ? '+' : '−'}${Math.abs(amount)}${unit}`;
  }
  const branch = amount as { then?: unknown; else?: unknown } | null;
  if (typeof branch?.then === 'number' && typeof branch?.else === 'number') {
    const [low, high] = [branch.then, branch.else].sort((a, b) => a - b);
    return `+${low}${unit} or +${high}${unit}`;
  }
  return null;
};

// Bond of Life from the data: its cap, the triggers that grant or consume
// it (the character's, its weapon's and set's) and the bonuses it enables.
const describeBondOfLife = (characterId: string): string[] => {
  const { character } = getLoadedCharacter(characterId);
  const bond = (character.systems as Record<string, any> | undefined)
    ?.bondOfLife;
  if (!bond) {
    return [];
  }
  const blocks = [
    ...character.blocks,
    ...character.weapon.blocks,
    ...character.artifactSet.blocks,
  ];
  const lines = [
    `Bond of Life: absorbs healing equal to its value before HP is restored; up to ${
      bond.max ?? 200
    }% of Max HP.`,
  ];
  const gained: string[] = [];
  const consumed: string[] = [];
  blocks.forEach((block) => {
    if (block.type !== 'trigger') {
      return;
    }
    block.do.forEach((op) => {
      const entry = op as Record<string, unknown>;
      const label = (block as { label?: string }).label ?? humanize(block.id);
      if (entry.addResource === BOND_ID) {
        const amount = describeAmount(entry.amount, '%');
        const negative = typeof entry.amount === 'number' && entry.amount < 0;
        (negative ? consumed : gained).push(
          `• ${label}${amount ? ` (${amount})` : ''}`
        );
      } else if (
        entry.multiplyResource === BOND_ID &&
        typeof entry.by === 'number'
      ) {
        const share = Math.round((1 - entry.by) * 1000) / 10;
        consumed.push(`• ${label} (−${share}% of it)`);
      } else if (entry.setResource === BOND_ID) {
        gained.push(`• ${label} (set to ${entry.value}%)`);
      }
    });
  });
  if (gained.length > 0) {
    lines.push('Gained by:', ...gained);
  }
  if (consumed.length > 0) {
    lines.push('Consumed by:', ...consumed);
  }
  const bonuses = blocks.flatMap((block) => {
    const bounds = (block as { while?: Record<string, object> }).while?.[
      BOND_ID
    ];
    if (block.type !== 'bonus' || !bounds) {
      return [];
    }
    const label = (block as { label?: string }).label ?? humanize(block.id);
    return [`• ${label} (${describeBounds(bounds, '%')})`];
  });
  if (bonuses.length > 0) {
    lines.push('Bonuses it enables:', ...Array.from(new Set(bonuses)));
  }
  return lines;
};

const BOND_ID = 'bondOfLife';

export const describeSystemStatus = (
  characterId: string,
  blockId: string | undefined
): string[] => {
  if (blockId === BOND_ID) {
    return describeBondOfLife(characterId);
  }
  if (blockId !== 'nightsoulBlessing') {
    return [];
  }
  const { character } = getLoadedCharacter(characterId);
  const nightsoul = (character.systems as Record<string, any> | undefined)
    ?.nightsoul;
  if (!nightsoul) {
    return [];
  }
  const blessing = nightsoul.blessing ?? {};
  const name = blessing.label ?? "Nightsoul's Blessing";
  const points = nightsoul.label ?? 'Nightsoul points';
  const lines = [`${name}: ${character.name}'s Nightsoul state.`];
  if (typeof blessing.durationFrames === 'number') {
    lines.push(`• Lasts ${Math.round(blessing.durationFrames / FRAMES)} s.`);
  }
  if (blessing.drain) {
    const perSecond =
      Math.round(
        ((blessing.drain.amount ?? 1) * FRAMES * 10) /
          blessing.drain.everyFrames
      ) / 10;
    lines.push(
      `• Drains ${perSecond} ${points} per second (max ${nightsoul.maxPoints}); ends when they run out.`
    );
  }
  if (blessing.enterAtMax) {
    lines.push(`• Entered when the ${points} reach ${nightsoul.maxPoints}.`);
  }
  if (blessing.resetPointsOnEnd) {
    lines.push(`• ${points} go back to 0 when it ends.`);
  }
  // What it changes: the talents' forms while it lasts, and its bonuses.
  const forms = character.talents.flatMap((talent) =>
    (talent.forms ?? [])
      .filter((form) => JSON.stringify(form.while ?? {}).includes(blockId))
      .map((form) => {
        const replaced = form.replaces
          ? ACTION_TITLES[form.replaces] ?? humanize(form.replaces)
          : ACTION_TITLES[talent.kind] ?? talent.name;
        return `• ${replaced} → ${form.label ?? humanize(form.id)}`;
      })
  );
  if (forms.length > 0) {
    lines.push('While it lasts, her attacks change:', ...forms);
  }
  const bonuses = character.blocks.filter(
    (block) =>
      block.type === 'bonus' &&
      JSON.stringify((block as { while?: unknown }).while ?? {}).includes(
        blockId
      )
  );
  if (bonuses.length > 0) {
    lines.push(
      'Bonuses while it lasts:',
      ...bonuses.map(
        (block) => `• ${(block as { label?: string }).label ?? block.id}`
      )
    );
  }
  if (nightsoul.nightsoulBurst) {
    lines.push(
      `${
        nightsoul.nightsoulBurst.label ?? 'Nightsoul Burst'
      }: on a party member's Elemental hit, once every 18 / 12 / 9 s (1 / 2 / 3+ Natlan members).`
    );
  }
  return lines;
};
