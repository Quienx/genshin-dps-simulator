import { useDroppable } from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import { MouseEvent, ReactNode, useState } from 'react';

import { cn } from '@/lib/utils';

import { TooltipProvider } from '@/components/ui/tooltip';

import RotationCooldownLanes from './RotationCooldownLanes';
import { TRACK_DROP_ID } from './rotationDragIds';
import RotationPiece from './RotationPiece';
import RotationSortablePiece from './RotationSortablePiece';
import formatNumber from '../../_lib/formatNumber';
import { BlockDamage } from '../../_lib/rotation/automaticRotation';
import { findAction } from '../../_lib/rotation/blocks';
import { getPieceCooldown } from '../../_lib/rotation/cooldownSeries';
import { BlockMember } from '../../_lib/rotation/memberStyles';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import {
  getTimelineTime,
  PIECE_GAP,
  splitTimelineRows,
  TimelineLayout,
} from '../../_lib/rotation/timelineLayout';
import { getCooldownLanes } from '../../_lib/rotation/timeStrip';
import { RotationBlock, RotationTraceEntry } from '../../_lib/rotation/types';
import { CooldownTrack } from '../../_lib/types';

type RotationTrackProps = {
  layout: TimelineLayout;
  blocks: RotationBlock[];
  actions: RotationAction[];
  duration: number;
  combosByBlock?: Record<string, number[]>;
  damageByBlock?: Record<string, BlockDamage>;
  // Shown on pieces without DMG (a team before its Simulate run).
  damageNote?: string;
  warningsByBlock?: Record<string, string>;
  notesByBlock?: Record<string, string>;
  selectedUid?: string | null;
  cooldowns?: CooldownTrack[];
  // The cooldowns a piece shows, when not every one (a team's member's).
  cooldownsFor?: (actionId: string) => CooldownTrack[];
  // What was played: draws the E / Q cooldown bars under the pieces.
  trace?: RotationTraceEntry[];
  // Read-only tracks (Automatic mode) render outside any DndContext.
  readOnly?: boolean;
  // Cut the track into rows of this many seconds (a team's 60 s as six
  // rows of 10 s); each piece goes to the row where it starts.
  rowSeconds?: number;
  // More for a piece's tooltip, from the time it starts and its block.
  pieceExtra?: (start: number, blockUid: string) => ReactNode;
  // Pieces' own details as one line of symbols.
  compactDetails?: boolean;
  // A team piece's member (color and avatar), by action id.
  memberFor?: (actionId: string) => BlockMember | undefined;
  onSelect?: (uid: string) => void;
};

type TrackRowProps = {
  layout: TimelineLayout;
  duration: number;
  label?: string;
  children: ReactNode;
};

// Ticks over a row of pieces, with a hover cursor showing the time under
// the pointer, like the activity timeline's.
const TrackRow = ({ layout, duration, label, children }: TrackRowProps) => {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    setHoverX(x >= 0 && x <= layout.totalWidth ? x : null);
  };
  return (
    <div className='flex items-start gap-2'>
      {label && (
        <span
          data-testid='rotation-track-row-label'
          className='w-14 shrink-0 pt-4 text-[11px] font-medium text-muted-foreground tabular-nums'
        >
          {label}
        </span>
      )}
      <div className='min-w-0 flex-1 overflow-x-auto pb-1'>
        <div
          className='relative min-w-full'
          style={{ width: layout.totalWidth }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverX(null)}
        >
          <div
            aria-hidden
            className='relative h-4 text-[10px] text-muted-foreground'
          >
            {layout.ticks.map((tick, index) => (
              <span
                key={`${tick.time}-${index}`}
                className='absolute top-0 border-l border-muted-foreground/40 pl-0.5 tabular-nums'
                style={{ left: tick.x }}
              >
                {tick.time}s
              </span>
            ))}
          </div>
          {children}
          {hoverX !== null && (
            <div
              data-testid='rotation-track-cursor'
              aria-hidden
              className='pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground/50'
              style={{ left: hoverX }}
            >
              <span className='absolute top-0 left-1/2 -translate-x-1/2 rounded border bg-popover px-1 text-[10px] font-medium whitespace-nowrap tabular-nums shadow-sm'>
                {formatNumber(getTimelineTime(layout, hoverX, duration))} s
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TrackDropZone = ({ children }: { children: ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: TRACK_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn('min-h-20 rounded', isOver && 'bg-primary/5')}
    >
      {children}
    </div>
  );
};

const getTailLabel = (kind: 'loop' | 'idle', from: number, duration: number) =>
  kind === 'loop'
    ? `↻ Repeats from ${formatNumber(from)} s to ${formatNumber(duration)} s`
    : `Idle from ${formatNumber(from)} s to ${formatNumber(duration)} s`;

const RotationTrack = ({
  layout,
  blocks,
  actions,
  duration,
  combosByBlock = {},
  damageByBlock = {},
  damageNote,
  warningsByBlock = {},
  notesByBlock = {},
  selectedUid = null,
  cooldowns = [],
  cooldownsFor,
  trace,
  readOnly = false,
  rowSeconds,
  pieceExtra,
  compactDetails = false,
  memberFor,
  onSelect = () => undefined,
}: RotationTrackProps) => {
  const pieces = blocks.map((block, index) => {
    const action = findAction(actions, block.action);
    const piece = layout.pieces[index];
    if (!action || !piece) {
      return null;
    }
    const shared = {
      block,
      action,
      piece,
      presses: combosByBlock[block.uid],
      damage: damageByBlock[block.uid],
      damageNote,
      warning: warningsByBlock[block.uid] ?? null,
      note: notesByBlock[block.uid] ?? null,
      isSelected: block.uid === selectedUid,
      compactDetails,
      member: memberFor?.(block.action),
      extraDetails:
        pieceExtra && piece.start !== null
          ? pieceExtra(piece.start, block.uid)
          : undefined,
      cooldowns:
        piece.start === null
          ? []
          : (cooldownsFor?.(block.action) ?? cooldowns).flatMap((track) => {
              const cooldown = getPieceCooldown(
                track,
                block.action,
                piece.start ?? 0
              );
              return cooldown ? [cooldown] : [];
            }),
    };
    return readOnly ? (
      <RotationPiece key={block.uid} {...shared} />
    ) : (
      <RotationSortablePiece
        key={block.uid}
        {...shared}
        onSelectBlock={onSelect}
      />
    );
  });

  const tailOf = (rowLayout: TimelineLayout) =>
    rowLayout.tail && (
      <div
        data-testid='rotation-track-tail'
        className='flex h-20 shrink-0 items-center rounded border border-dashed px-2 text-[11px] text-muted-foreground'
        style={{ width: rowLayout.tail.width }}
      >
        {getTailLabel(rowLayout.tail.kind, rowLayout.tail.from, duration)}
      </div>
    );
  const pieceRow = (rowPieces: ReactNode[], rowLayout: TimelineLayout) => (
    <div className='flex min-h-20 items-stretch' style={{ gap: PIECE_GAP }}>
      {rowPieces}
      {tailOf(rowLayout)}
    </div>
  );
  const sortable = (content: ReactNode) =>
    readOnly ? (
      content
    ) : (
      <SortableContext
        items={blocks.map((block) => block.uid)}
        strategy={horizontalListSortingStrategy}
      >
        <TrackDropZone>{content}</TrackDropZone>
      </SortableContext>
    );
  const emptyHint = !readOnly && blocks.length === 0 && (
    <p className='flex h-20 items-center px-2 text-sm text-muted-foreground'>
      Drag actions here, or click them to add at the end.
    </p>
  );

  if (rowSeconds) {
    const rows = splitTimelineRows(layout, rowSeconds, duration);
    return (
      <TooltipProvider delayDuration={150}>
        <div
          data-testid={readOnly ? 'rotation-track-readonly' : 'rotation-track'}
          className='flex flex-col gap-1'
        >
          {sortable(
            <div className='flex flex-col gap-1 divide-y'>
              {rows.map((row, index) => (
                <div
                  key={index}
                  data-testid={`rotation-track-row-${index}`}
                  className='pt-1'
                >
                  <TrackRow
                    layout={row.layout}
                    duration={duration}
                    label={`${formatNumber(row.from)}–${formatNumber(
                      row.to
                    )} s`}
                  >
                    {pieceRow(
                      row.indexes.map((index) => pieces[index]),
                      row.layout
                    )}
                  </TrackRow>
                </div>
              ))}
              {emptyHint}
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  const lanes = trace ? getCooldownLanes(trace, cooldowns, duration) : [];

  return (
    <TooltipProvider delayDuration={150}>
      <div
        data-testid={readOnly ? 'rotation-track-readonly' : 'rotation-track'}
      >
        <TrackRow layout={layout} duration={duration}>
          {sortable(
            <>
              {pieceRow(pieces, layout)}
              {emptyHint}
            </>
          )}
          {lanes.length > 0 && (
            <RotationCooldownLanes
              lanes={lanes}
              layout={layout}
              duration={duration}
              actions={actions}
            />
          )}
        </TrackRow>
      </div>
    </TooltipProvider>
  );
};

export default RotationTrack;
