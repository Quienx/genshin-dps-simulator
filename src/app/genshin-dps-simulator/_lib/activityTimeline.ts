import { ActivityBlock, ActivityLog } from './engine/runtime';
import formatNumber from './formatNumber';
import { FRAMES_PER_SECOND } from './frames';
import { RotationAction } from './rotation/rotationSchema';
import { getDeadWait } from './rotation/timelineLayout';
import { RotationTraceEntry } from './rotation/types';
import { HitLogEntry } from './types';

export type ActivityGroup =
  | 'actions'
  | 'talent'
  | 'passive'
  | 'constellation'
  | 'weapon'
  | 'artifact'
  | 'resources';

export const ACTIVITY_GROUPS: { id: ActivityGroup; label: string }[] = [
  { id: 'actions', label: 'Actions' },
  { id: 'talent', label: 'Talents' },
  { id: 'passive', label: 'Passives' },
  { id: 'constellation', label: 'Constellations' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'artifact', label: 'Artifacts' },
  { id: 'resources', label: 'Resources' },
];

export type ActivitySpan = {
  start: number;
  end: number;
  // null: what the span stands for does not deal damage (a buff).
  damage: number | null;
  // Hits it dealt (or, for a buff, the hits it buffed).
  hits: number;
  // What it stands for when the row alone does not say (the action a
  // cooldown wait was for).
  label?: string;
};

export type ActivityRow = {
  id: string;
  group: ActivityGroup;
  label: string;
  // A rotation action kind for action rows, the block source otherwise.
  colorKey: string;
  // What the row shows, for its icon.
  action?: RotationAction;
  block?: ActivityBlock;
  // Bonuses: what they do, in words, and the value alone.
  effect?: string;
  effectShort?: string;
  spans: ActivitySpan[];
  // Instant events, in seconds: a trigger firing, a stack being added.
  marks: number[];
  // Stack statuses: when each stack was up, in seconds.
  stacks?: { start: number; end: number }[];
  // Resources: the value after each change, and the top of the scale.
  points?: { time: number; value: number }[];
  max?: number;
  format?: 'percent';
  // null for rows that never deal damage of their own (buffs).
  damage: number | null;
  hits: number;
  // Right-column text, when it is not the row's DMG (dead time).
  summary?: string;
};

type BuildOptions = {
  trace: RotationTraceEntry[];
  activity?: ActivityLog;
  hits: HitLogEntry[];
  actions: RotationAction[];
  duration: number;
};

// Buffed hits further apart than this start a new "active" span.
const BUFF_GAP_SECONDS = 1;

const toSeconds = (frame: number): number => frame / FRAMES_PER_SECOND;

const sumDamage = (hits: HitLogEntry[]): number =>
  hits.reduce((sum, hit) => sum + hit.damage, 0);

// Damage of the row's own hits, or null when it has none and is not an
// action (a status that only buffs).
const ownDamage = (hits: HitLogEntry[]): number | null =>
  hits.length > 0 ? sumDamage(hits) : null;

const clampSpan = (span: ActivitySpan, duration: number): ActivitySpan => ({
  ...span,
  start: Math.min(span.start, duration),
  end: Math.min(Math.max(span.end, span.start), duration),
});

// One row per action used, in palette order; each span gets the hits of
// that action from its start until the next use of the same action.
const buildActionRows = (
  trace: RotationTraceEntry[],
  hits: HitLogEntry[],
  actions: RotationAction[]
): ActivityRow[] => {
  // Rows follow what was performed: a Normal Attack that was a bite is a
  // "Sharky's Bite" row.
  const performed = (entry: RotationTraceEntry) =>
    entry.performedAction ?? entry.action;
  const usedIds = new Set(trace.map(performed));
  const ordered: RotationAction[] = [
    ...actions.filter((action) => usedIds.has(action.id)),
    // Actions a kit performs that its palette does not list.
    ...trace
      .filter(
        (entry, index) =>
          !actions.some((action) => action.id === performed(entry)) &&
          trace.findIndex((other) => performed(other) === performed(entry)) ===
            index
      )
      .map((entry) => ({
        id: performed(entry),
        kind: entry.kind,
        label: entry.label,
        shortLabel: entry.label,
      })),
  ];

  return ordered.map((action) => {
    const entries = trace.filter((entry) => performed(entry) === action.id);
    const ownHits = hits.filter((hit) => hit.actionId === action.id);
    const spans = entries.map((entry, index) => {
      const nextStart = entries[index + 1]?.startTime ?? Infinity;
      const spanHits = ownHits.filter(
        (hit) => hit.time >= entry.startTime && hit.time < nextStart
      );
      return {
        start: entry.startTime,
        end: entry.endTime,
        damage: spanHits.length > 0 ? sumDamage(spanHits) : 0,
        hits: spanHits.length,
      };
    });
    return {
      id: `action:${action.id}`,
      group: 'actions',
      label: action.label,
      colorKey: action.kind,
      action,
      spans,
      marks: [],
      damage: sumDamage(ownHits),
      hits: ownHits.length,
    };
  });
};

// Dead time: the waits before actions whose cooldown was not ready.
const buildWaitingRow = (trace: RotationTraceEntry[]): ActivityRow[] => {
  const waits = trace.filter((entry) => getDeadWait(entry) > 0);
  if (waits.length === 0) {
    return [];
  }
  const total = waits.reduce((sum, entry) => sum + entry.waitedSeconds, 0);
  return [
    {
      id: 'action:waiting',
      group: 'actions',
      label: 'Waiting (cooldown)',
      colorKey: 'wait',
      action: {
        id: 'waiting',
        kind: 'wait',
        label: 'Waiting (cooldown)',
        shortLabel: 'Wait',
      },
      spans: waits.map((entry) => ({
        start: entry.startTime - entry.waitedSeconds,
        end: entry.startTime,
        damage: null,
        hits: 0,
        label: entry.label,
      })),
      marks: [],
      damage: null,
      hits: 0,
      summary: `${(Math.round(total * 10) / 10).toString()} s`,
    },
  ];
};

// Times of the hits a bonus applied to, merged into "active" spans.
const getBuffSpans = (times: number[]): ActivitySpan[] =>
  times.reduce<ActivitySpan[]>((spans, time) => {
    const last = spans[spans.length - 1];
    if (last && time - last.end < BUFF_GAP_SECONDS) {
      last.end = time;
      last.hits += 1;
      return spans;
    }
    spans.push({ start: time, end: time, damage: null, hits: 1 });
    return spans;
  }, []);

const mergeIntervals = (
  intervals: { start: number; end: number }[]
): { start: number; end: number }[] =>
  [...intervals]
    .sort((first, second) => first.start - second.start)
    .reduce<{ start: number; end: number }[]>((merged, interval) => {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
        return merged;
      }
      merged.push({ ...interval });
      return merged;
    }, []);

const toGroup = (block: ActivityBlock): ActivityGroup =>
  block.type === 'resource' || block.source === 'system'
    ? 'resources'
    : block.source;

// Bonuses sharing a group and label (both Crimson Moon tiers, Masque's
// infusion and its extra DMG) are one row: active whenever any applied.
const buildBuffRow = (
  blocks: ActivityBlock[],
  hits: HitLogEntry[]
): ActivityRow => {
  const ids = blocks.map((block) => block.id);
  const buffed = hits.filter((hit) =>
    hit.effectIds?.some((id) => ids.includes(id))
  );
  const unique = (texts: (string | undefined)[]) =>
    Array.from(new Set(texts.filter(Boolean))).join(' / ') || undefined;
  return {
    id: `block:${ids.join('+')}`,
    group: toGroup(blocks[0]),
    label: blocks[0].label,
    colorKey: blocks[0].source,
    block: blocks.find((block) => block.icon) ?? blocks[0],
    effect: unique(blocks.map((block) => block.effect)),
    effectShort: unique(blocks.map((block) => block.effectShort)),
    spans: getBuffSpans(buffed.map((hit) => hit.time)),
    marks: [],
    damage: null,
    hits: buffed.length,
  };
};

const buildResourceRow = (
  block: ActivityBlock,
  activity: ActivityLog
): ActivityRow => ({
  id: `block:${block.id}`,
  group: 'resources',
  label: block.label,
  colorKey: 'resource',
  block,
  spans: [],
  marks: [],
  points: (activity.resources[block.id] ?? []).map((change) => ({
    time: toSeconds(change.frame),
    value: change.value,
  })),
  // A running total has no fixed max: it scales to its highest value.
  max: Number.isFinite(block.max)
    ? block.max
    : Math.max(
        1,
        ...(activity.resources[block.id] ?? []).map((change) => change.value)
      ),
  format: block.format,
  damage: null,
  hits: 0,
});

// Statuses: when they were up (a stack status, while any stack lasts),
// with the damage of their own hits (ticks) if they deal any.
const buildStatusRow = (
  block: ActivityBlock,
  activity: ActivityLog,
  hits: HitLogEntry[]
): ActivityRow => {
  const ownHits = hits.filter((hit) => hit.sourceId === block.id);
  const stacks = activity.stacks[block.id] ?? [];
  const intervals =
    block.stackFrames === undefined
      ? activity.statuses[block.id] ?? []
      : mergeIntervals(stacks.filter((stack) => stack.end > stack.start));
  return {
    id: `block:${block.id}`,
    group: toGroup(block),
    label: block.label,
    colorKey: block.source,
    block,
    spans: intervals.map((interval) => {
      const start = toSeconds(interval.start);
      const end = toSeconds(interval.end);
      const inside = ownHits.filter(
        (hit) => hit.time >= start && hit.time <= end
      );
      return {
        start,
        end,
        damage: ownHits.length > 0 ? sumDamage(inside) : null,
        hits: inside.length,
      };
    }),
    marks: stacks.map((stack) => toSeconds(stack.start)),
    stacks:
      block.stackFrames === undefined
        ? undefined
        : stacks.map((stack) => ({
            start: toSeconds(stack.start),
            end: toSeconds(stack.end),
          })),
    damage: ownDamage(ownHits),
    hits: ownHits.length,
  };
};

// Triggers: a mark each time they fired, and the damage of hits they made.
const buildTriggerRow = (
  blocks: ActivityBlock[],
  activity: ActivityLog,
  hits: HitLogEntry[]
): ActivityRow => {
  const ids = blocks.map((block) => block.id);
  const ownHits = hits.filter(
    (hit) => hit.sourceId !== undefined && ids.includes(hit.sourceId)
  );
  return {
    id: `block:${ids.join('+')}`,
    group: toGroup(blocks[0]),
    label: blocks[0].label,
    colorKey: blocks[0].source,
    block: blocks.find((block) => block.icon) ?? blocks[0],
    spans: [],
    marks: ids
      .flatMap((id) => activity.triggers[id] ?? [])
      .sort((first, second) => first - second)
      .map(toSeconds),
    damage: ownDamage(ownHits),
    hits: ownHits.length,
  };
};

// Bonuses and triggers that share a group and label are one row (both
// Crimson Moon tiers; one Nightsoul Burst trigger per party size).
const MERGED_TYPES: ActivityBlock['type'][] = ['bonus', 'trigger'];

const buildBlockRows = (
  activity: ActivityLog,
  hits: HitLogEntry[]
): ActivityRow[] => {
  const getKey = (block: ActivityBlock) =>
    `${block.type}:${toGroup(block)}:${block.label}`;
  const merged = new Map<string, ActivityBlock[]>();
  activity.blocks
    .filter((block) => MERGED_TYPES.includes(block.type))
    .forEach((block) => {
      merged.set(getKey(block), [...(merged.get(getKey(block)) ?? []), block]);
    });

  return activity.blocks.flatMap((block): ActivityRow[] => {
    const group = merged.get(getKey(block)) ?? [block];
    // The row goes where the first block of its group is.
    if (MERGED_TYPES.includes(block.type) && group[0] !== block) {
      return [];
    }
    switch (block.type) {
      case 'bonus':
        return [buildBuffRow(group, hits)];
      case 'resource':
        return [buildResourceRow(block, activity)];
      case 'status':
        return [buildStatusRow(block, activity, hits)];
      default:
        return [buildTriggerRow(group, activity, hits)];
    }
  });
};

// Every row of the activity timeline, grouped in ACTIVITY_GROUPS order.
export const buildActivityRows = ({
  trace,
  activity,
  hits,
  actions,
  duration,
}: BuildOptions): ActivityRow[] => {
  const rows = [
    ...buildActionRows(trace, hits, actions),
    ...buildWaitingRow(trace),
    ...(activity ? buildBlockRows(activity, hits) : []),
  ].map((row) => ({
    ...row,
    spans: row.spans.map((span) => clampSpan(span, duration)),
    marks: row.marks.filter((mark) => mark <= duration),
  }));

  const order = ACTIVITY_GROUPS.map((group) => group.id);
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (first, second) =>
        order.indexOf(first.row.group) - order.indexOf(second.row.group) ||
        first.index - second.index
    )
    .map(({ row }) => row);
};

// ---------------------------------------------------------- display

// Back-to-back uses (a Normal Attack combo) shown as one segment.
export type ActivitySegment = ActivitySpan & { uses: number };

const SEGMENT_GAP_SECONDS = 0.1;

export const getSegments = (spans: ActivitySpan[]): ActivitySegment[] =>
  spans.reduce<ActivitySegment[]>((segments, span) => {
    const last = segments[segments.length - 1];
    if (last && span.start - last.end <= SEGMENT_GAP_SECONDS) {
      last.end = Math.max(last.end, span.end);
      last.hits += span.hits;
      last.uses += 1;
      last.damage =
        last.damage === null && span.damage === null
          ? null
          : (last.damage ?? 0) + (span.damage ?? 0);
      return segments;
    }
    segments.push({ ...span, uses: 1 });
    return segments;
  }, []);

// Events close together (a fraction of the run apart) share one icon.
export type MarkCluster = { start: number; end: number; count: number };

export const getMarkClusters = (
  marks: number[],
  duration: number,
  gapFraction = 0.02
): MarkCluster[] =>
  [...marks]
    .sort((first, second) => first - second)
    .reduce<MarkCluster[]>((clusters, mark) => {
      const last = clusters[clusters.length - 1];
      if (last && mark - last.end <= duration * gapFraction) {
        last.end = mark;
        last.count += 1;
        return clusters;
      }
      clusters.push({ start: mark, end: mark, count: 1 });
      return clusters;
    }, []);

export const formatResourceValue = (row: ActivityRow, value: number): string =>
  `${formatNumber(Math.round(value * 10) / 10)}${
    row.format === 'percent' ? '%' : ''
  }`;

// Value of a resource at a time: the last change at or before it.
export const getResourceValueAt = (
  row: ActivityRow,
  time: number
): number | null => {
  const points = row.points ?? [];
  const before = points.filter((point) => point.time <= time);
  return before.length > 0 ? before[before.length - 1].value : null;
};

// ---------------------------------------------------------- hover

const formatSeconds = (seconds: number): string => `${seconds.toFixed(2)} s`;

export const formatRange = (start: number, end: number): string =>
  end - start > 0.005
    ? `${formatSeconds(start)} – ${formatSeconds(end)} (${(end - start).toFixed(
        2
      )} s)`
    : `at ${formatSeconds(start)}`;

export type HoverTarget =
  | { kind: 'segment'; segment: ActivitySegment }
  | { kind: 'marks'; cluster: MarkCluster }
  | { kind: 'resource'; value: number | null };

// A row as drawn: its segments and its groups of events.
export type RowDisplay = {
  row: ActivityRow;
  segments: ActivitySegment[];
  clusters: MarkCluster[];
};

// What is under the pointer in a row: the segment that contains the time
// (short ones are drawn at least an icon wide), else a group of events
// within half an icon of it.
export const findHoverTarget = (
  display: RowDisplay,
  time: number,
  secondsPerPixel: number,
  iconSize: number
): HoverTarget | null => {
  const { row, segments, clusters } = display;
  if (row.points) {
    return { kind: 'resource', value: getResourceValueAt(row, time) };
  }
  const tolerance = secondsPerPixel * (iconSize / 2);
  const segment = segments.find(
    (entry) =>
      time >= entry.start &&
      time <=
        Math.max(entry.end, entry.start + secondsPerPixel * (iconSize + 2))
  );
  if (segment) {
    return { kind: 'segment', segment };
  }
  const cluster = clusters.find(
    (entry) => time >= entry.start - tolerance && time <= entry.end + tolerance
  );
  return cluster ? { kind: 'marks', cluster } : null;
};

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

// Tooltip text for what the pointer is over.
export const getTooltipLines = (
  row: ActivityRow,
  target: HoverTarget
): string[] => {
  if (target.kind === 'resource') {
    if (target.value === null) {
      return ['—'];
    }
    const value = formatResourceValue(row, target.value);
    const ofWhat = row.format === 'percent' ? ' of Max HP' : '';
    return [
      row.max === undefined
        ? `${value}${ofWhat}`
        : `${value}${ofWhat} (cap ${formatResourceValue(row, row.max)})`,
    ];
  }
  if (target.kind === 'marks') {
    const { cluster } = target;
    const fired = cluster.count === 1 ? 'Fired' : `Fired ${cluster.count}×`;
    return [`${fired} ${formatRange(cluster.start, cluster.end)}`];
  }
  const { segment } = target;
  const lines: string[] = [];
  if (row.id === 'action:waiting') {
    return [
      `Waiting for ${segment.label ?? 'a cooldown'}: nothing happens`,
      formatRange(segment.start, segment.end),
    ];
  }
  if (row.effect) {
    lines.push(row.effect);
  }
  if (row.group === 'actions') {
    lines.push(segment.uses === 1 ? '1 use' : `${segment.uses} uses in a row`);
  }
  lines.push(formatRange(segment.start, segment.end));
  if (segment.damage === null) {
    lines.push(
      row.block?.type === 'bonus'
        ? `Buffed ${plural(segment.hits, 'hit')}`
        : 'Active, deals no DMG of its own'
    );
  } else if (segment.hits === 0) {
    lines.push('No DMG');
  } else {
    lines.push(
      `${plural(segment.hits, 'hit')} · ${formatNumber(
        Math.round(segment.damage)
      )} DMG`
    );
  }
  return lines;
};

// ---------------------------------------------------------- cursor values

const formatCompact = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

// What a row reads at the cursor's time, for the badge next to the cursor
// line; null when nothing of that row is up then.
export const getValueAt = (
  display: RowDisplay,
  time: number,
  secondsPerPixel: number,
  iconSize: number
): string | null => {
  const { row } = display;
  // Every row but the actions says what it is, since the value alone
  // ("active", "3 stacks") does not.
  const named = (value: string | null) =>
    value ? `${row.label} · ${value}` : row.label;
  if (row.points) {
    const value = getResourceValueAt(row, time);
    return value === null ? null : named(formatResourceValue(row, value));
  }
  const target = findHoverTarget(display, time, secondsPerPixel, iconSize);
  if (!target) {
    return null;
  }
  if (target.kind === 'marks') {
    return named(
      target.cluster.count > 1 ? `${target.cluster.count}×` : 'fired'
    );
  }
  if (target.kind !== 'segment') {
    return null;
  }
  const { segment } = target;
  if (row.id === 'action:waiting') {
    return `waiting for ${segment.label ?? 'a cooldown'}`;
  }
  if (row.group === 'actions') {
    const uses = segment.uses > 1 ? `×${segment.uses} · ` : '';
    return segment.damage
      ? `${uses}${formatCompact(segment.damage)}`
      : `${uses}no DMG`;
  }
  if (row.block?.type === 'bonus') {
    return named(row.effectShort ?? null);
  }
  const { stackMax } = row.block ?? {};
  if (row.stacks) {
    const up = row.stacks.filter(
      (stack) => stack.start < time && time <= stack.end
    ).length;
    const stacks = Math.min(stackMax ?? up, up);
    return named(`${stacks} stack${stacks === 1 ? '' : 's'}`);
  }
  return named(segment.damage ? formatCompact(segment.damage) : null);
};
