import { RotationBlock, RotationTraceEntry } from './types';

export const PX_PER_SECOND = 24;
export const MIN_PIECE_WIDTH = 32;
// Space between pieces. Ticks are placed from each piece's own position, so the
// gap never shifts the time axis.
export const PIECE_GAP = 6;
const TICK_SECONDS = 5;

export type TimelinePiece = {
  uid: string;
  // First-pass start; null when the block never plays within the duration.
  start: number | null;
  end: number | null;
  // Seconds of it spent waiting for a cooldown (dead time), at its start.
  waited: number;
  left: number;
  width: number;
};

export type TimelineTick = { time: number; x: number };

export type TimelineTail = {
  // Seconds after the first pass: looped repeats or idle time.
  kind: 'loop' | 'idle';
  from: number;
  left: number;
  width: number;
};

export type TimelineLayout = {
  pieces: TimelinePiece[];
  ticks: TimelineTick[];
  tail: TimelineTail | null;
  totalWidth: number;
};

// Seconds of an entry's cooldown wait that are dead time. Waiting to move
// again (Mualani's 0.7 s between surfs into the enemy) is still moving.
export const getDeadWait = (entry: RotationTraceEntry): number =>
  entry.kind === 'move' ? 0 : entry.waitedSeconds;

type PassTimes = Record<string, { start: number; end: number; waited: number }>;

// Start of every block's first play, and when that play ends. A block
// starts when it could have (its cooldown wait is part of it) and runs
// until the next block starts.
const getFirstPassTimes = (
  blocks: RotationBlock[],
  trace: RotationTraceEntry[]
): { times: PassTimes; passEnd: number | null } => {
  const order = new Map(blocks.map((block, index) => [block.uid, index]));
  const times: PassTimes = {};
  let lastIndex = -1;
  let passEnd: number | null = null;

  for (const entry of trace) {
    const index = order.get(entry.blockUid);
    if (index === undefined) {
      continue;
    }
    // Going back to an earlier block means the loop started over.
    if (index < lastIndex) {
      break;
    }
    lastIndex = index;
    const current = times[entry.blockUid];
    times[entry.blockUid] = {
      start: current?.start ?? entry.startTime - entry.waitedSeconds,
      end: entry.endTime,
      waited: (current?.waited ?? 0) + getDeadWait(entry),
    };
    passEnd = entry.endTime;
  }
  return { times, passEnd };
};

type TimedPiece = TimelinePiece & { start: number; end: number };

const isTimed = (piece: TimelinePiece): piece is TimedPiece =>
  piece.start !== null && piece.end !== null;

// Inside a piece, time maps linearly onto its width.
const timeToX = (pieces: TimelinePiece[], time: number): number | null => {
  const piece = pieces
    .filter(isTimed)
    .find((entry) => time >= entry.start && time < entry.end);
  if (!piece) {
    return null;
  }
  const ratio = (time - piece.start) / Math.max(1e-6, piece.end - piece.start);
  return piece.left + ratio * piece.width;
};

// `pxPerSecond`: the scale (a team's rows fill the card's width).
export const computeTimelineLayout = (
  blocks: RotationBlock[],
  trace: RotationTraceEntry[],
  duration: number,
  loop: boolean,
  pxPerSecond = PX_PER_SECOND
): TimelineLayout => {
  const toWidth = (seconds: number): number =>
    Math.max(MIN_PIECE_WIDTH, seconds * pxPerSecond);
  const { times, passEnd } = getFirstPassTimes(blocks, trace);

  let cursor = 0;
  const pieces = blocks.map((block, index) => {
    const own = times[block.uid];
    const nextStart = blocks
      .slice(index + 1)
      .map((next) => times[next.uid]?.start)
      .find((start) => start !== undefined);
    const start = own?.start ?? null;
    // A block ends where the next starts, unless the next one overlaps it
    // (e.g. a Q cast during the E): then it keeps its own length.
    const followsAfter =
      own !== undefined && nextStart !== undefined && nextStart > own.start;
    const end = own
      ? Math.min(duration, followsAfter ? nextStart : own.end)
      : null;
    const width =
      start !== null && end !== null ? toWidth(end - start) : MIN_PIECE_WIDTH;
    const piece = {
      uid: block.uid,
      start,
      end,
      waited: own?.waited ?? 0,
      left: cursor,
      width,
    };
    cursor += width + PIECE_GAP;
    return piece;
  });

  // Ticks follow the pieces: inside a piece time maps linearly onto its
  // width, so a stretched short action does not shift the axis after it.
  const firstPassEnd = Math.min(duration, passEnd ?? 0);
  const toX = (time: number): number | null => timeToX(pieces, time);
  const ticks = Array.from(
    { length: Math.floor(firstPassEnd / TICK_SECONDS) + 1 },
    (_, index) => index * TICK_SECONDS
  ).flatMap((time) => {
    const x = toX(time);
    return x === null ? [] : [{ time, x }];
  });

  const tailSeconds = duration - firstPassEnd;
  const tail: TimelineTail | null =
    blocks.length > 0 && tailSeconds > 0.05
      ? {
          kind: loop ? 'loop' : 'idle',
          from: firstPassEnd,
          left: cursor,
          width: 120,
        }
      : null;

  return {
    pieces,
    ticks,
    tail,
    totalWidth: cursor + (tail ? tail.width : 0),
  };
};

// Where a time falls on the drawn track, for anything lined up with the
// pieces (the E and Q cooldown bars): inside a piece time maps onto its
// width; after the first pass, onto the tail; in between pieces, at the
// next one's start.
export const getTimelineX = (
  layout: TimelineLayout,
  time: number,
  duration: number
): number => {
  const { tail } = layout;
  if (tail && time >= tail.from) {
    const ratio = (time - tail.from) / Math.max(1e-6, duration - tail.from);
    return tail.left + Math.min(1, ratio) * tail.width;
  }
  const inside = timeToX(layout.pieces, time);
  if (inside !== null) {
    return inside;
  }
  const timed = layout.pieces.filter(isTimed);
  const next = timed.find((piece) => piece.start > time);
  if (next) {
    return next.left;
  }
  const last = timed[timed.length - 1];
  return last ? last.left + last.width : 0;
};

// The time under a position on the drawn track (the hover cursor): the
// inverse of `getTimelineX`. A gap between pieces reads as the next one's
// start; past the last piece, as the tail.
export const getTimelineTime = (
  layout: TimelineLayout,
  x: number,
  duration: number
): number => {
  const timed = layout.pieces.filter(isTimed);
  const piece = timed.find(
    (entry) => x >= entry.left && x < entry.left + entry.width
  );
  if (piece) {
    const ratio = (x - piece.left) / Math.max(1e-6, piece.width);
    return piece.start + ratio * (piece.end - piece.start);
  }
  const next = timed.find((entry) => entry.left > x);
  if (next) {
    return next.start;
  }
  const { tail } = layout;
  if (tail) {
    const ratio = Math.min(1, Math.max(0, (x - tail.left) / tail.width));
    return tail.from + ratio * (duration - tail.from);
  }
  const last = timed[timed.length - 1];
  return last ? last.end : 0;
};

export type TimelineRow = {
  // The row's span: it starts where the one before ends (a piece that
  // starts before the 10 s mark and runs past it stays in its row).
  from: number;
  to: number;
  // Indexes (in the block list) of the pieces that start in this row.
  indexes: number[];
  // The row on its own: its pieces from the left edge, its ticks (its
  // start, then the track's), and the tail on the last row.
  layout: TimelineLayout;
};

const roundTenth = (value: number): number => Math.round(value * 10) / 10;

// The track cut into rows of `rowSeconds` (a team's 60 s as six rows of
// 10 s): each piece goes to the row where it starts; pieces that never
// play, to the last one.
export const splitTimelineRows = (
  layout: TimelineLayout,
  rowSeconds: number,
  duration: number
): TimelineRow[] => {
  const count = Math.max(1, Math.ceil(duration / rowSeconds));
  const rowOf = (piece: TimelinePiece): number =>
    piece.start === null
      ? count - 1
      : Math.min(count - 1, Math.max(0, Math.floor(piece.start / rowSeconds)));
  const pieceAt = (x: number): number =>
    layout.pieces.findIndex(
      (piece) => x >= piece.left && x < piece.left + piece.width
    );

  let previousEnd = 0;
  const rows = Array.from({ length: count }, (_, row) => {
    const indexes = layout.pieces.flatMap((piece, index) =>
      rowOf(piece) === row ? [index] : []
    );
    const offset = indexes.length > 0 ? layout.pieces[indexes[0]].left : 0;
    let cursor = 0;
    const pieces = indexes.map((index) => {
      const piece = { ...layout.pieces[index], left: cursor };
      cursor += piece.width + PIECE_GAP;
      return piece;
    });
    const isLast = row === count - 1;
    const tail =
      isLast && layout.tail ? { ...layout.tail, left: cursor } : null;
    const from = previousEnd;
    const ends = pieces.flatMap((piece) =>
      piece.end === null ? [] : [piece.end]
    );
    const to = isLast && tail ? duration : Math.max(from, ...ends);
    previousEnd = to;
    const ticks = [
      ...(pieces.length > 0 || tail ? [{ time: roundTenth(from), x: 0 }] : []),
      ...layout.ticks.flatMap((tick) => {
        const index = pieceAt(tick.x);
        return index >= 0 &&
          indexes.includes(index) &&
          roundTenth(tick.time) !== roundTenth(from)
          ? [{ time: tick.time, x: tick.x - offset }]
          : [];
      }),
    ];
    return {
      from,
      to,
      indexes,
      layout: {
        pieces,
        ticks,
        tail,
        totalWidth: cursor + (tail ? tail.width : 0),
      },
    };
  });
  // After the rotation ends, rows with nothing in them and no time of their
  // own say nothing (and would all start at the same moment).
  return rows.filter(
    (row) => row.indexes.length > 0 || row.layout.tail !== null
  );
};
