import Image from 'next/image';
import {
  Fragment,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import RotationActionIcon from './rotation/RotationActionIcon';
import { getBlockDescription, getBlockIconUrl } from '../_lib/activitySources';
import {
  ACTIVITY_GROUPS,
  ActivityRow,
  ActivitySegment,
  buildActivityRows,
  findHoverTarget,
  formatRange,
  formatResourceValue,
  getMarkClusters,
  getSegments,
  getTooltipLines,
  getValueAt,
  RowDisplay,
} from '../_lib/activityTimeline';
import { getCharacterData } from '../_lib/characterData';
import { CHARACTERS } from '../_lib/characters';
import { CharacterData } from '../_lib/characterSchema';
import { formatCompactNumber, getTimeTicks } from '../_lib/hitTimeline';
import { getRotationActions } from '../_lib/rotation/blocks';
import { KIND_STYLES } from '../_lib/rotation/kindStyles';
import { RotationActionKind } from '../_lib/rotation/rotationSchema';
import { SimulationOutcome } from '../_lib/types';

type ActivityTimelineProps = {
  outcome: SimulationOutcome;
};

const SOURCE_COLORS: Record<string, string> = {
  talent: 'bg-orange-500',
  passive: 'bg-emerald-500',
  constellation: 'bg-indigo-500',
  weapon: 'bg-amber-500',
  artifact: 'bg-pink-500',
  resource: 'bg-sky-500',
};

const ROW_GRID =
  'grid grid-cols-[8rem_minmax(0,1fr)_3.5rem] items-center gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_4.5rem]';

const LABEL_ICON_SIZE = 16;
// Half of the tooltip's widest (max-w-72), to keep it inside the chart.
const TOOLTIP_HALF_WIDTH = 144;
const MAX_TICKS_PER_CLUSTER = 30;
const TRACK_ICON_SIZE = 16;
// Plot width assumed before the first measurement.
const DEFAULT_PLOT_WIDTH = 600;

const getColor = (row: ActivityRow): string =>
  KIND_STYLES[row.colorKey as RotationActionKind]?.bar ??
  SOURCE_COLORS[row.colorKey] ??
  'bg-zinc-400';

const toPercent = (seconds: number, duration: number): string =>
  `${(seconds / Math.max(duration, 1e-9)) * 100}%`;

const isIdle = (row: ActivityRow): boolean =>
  row.spans.length === 0 &&
  row.marks.length === 0 &&
  (row.points?.length ?? 0) <= 1;

// Right column: the row's own DMG, or whether a buff or event was ever up.
const getSummary = (row: ActivityRow): string => {
  if (row.summary) {
    return row.summary;
  }
  if (row.points) {
    const peak = Math.max(0, ...row.points.map((point) => point.value));
    return `max ${formatResourceValue(row, peak)}`;
  }
  if (row.damage !== null) {
    return formatCompactNumber(row.damage);
  }
  if (isIdle(row)) {
    return 'never';
  }
  return row.marks.length > 0 && row.spans.length === 0
    ? `${row.marks.length}×`
    : 'active';
};

// Step area of a resource's value over time, in a 100 × 10 box.
const getResourcePath = (row: ActivityRow, duration: number): string => {
  const points = row.points ?? [];
  const max = row.max ?? Math.max(1, ...points.map((point) => point.value));
  const round = (value: number) => Math.round(value * 100) / 100;
  const toY = (value: number) => round(10 - (Math.min(value, max) / max) * 10);
  const toX = (time: number) =>
    round((Math.min(time, duration) / duration) * 100);
  let y = 10;
  const steps = points.map((point) => {
    const x = toX(point.time);
    const step = `L${x},${y}`;
    y = toY(point.value);
    return `${step} L${x},${y}`;
  });
  return `M0,10 ${steps.join(' ')} L100,${y} L100,10 Z`;
};

// Label hover text: the name, what it does, and where it comes from.
const getRowTitle = (row: ActivityRow, character: CharacterData): string =>
  [
    row.label,
    row.effect,
    row.block ? getBlockDescription(character, row.block) : null,
  ]
    .filter(Boolean)
    .join('\n');

// ---------------------------------------------------------------- icons

const RowIcon = ({
  row,
  character,
  size,
}: {
  row: ActivityRow;
  character: CharacterData;
  size: number;
}) => {
  if (row.action) {
    return <RotationActionIcon action={row.action} size={size} />;
  }
  const src = row.block ? getBlockIconUrl(character, row.block) : null;
  if (!src) {
    // No icon known: a dot in the row's color.
    return (
      <span
        className='inline-flex shrink-0 items-center justify-center'
        style={{ width: size, height: size }}
      >
        <span className={cn('size-2 rounded-full', getColor(row))} />
      </span>
    );
  }
  return (
    <span className='inline-flex shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10'>
      <Image unoptimized src={src} alt='' width={size} height={size} />
    </span>
  );
};

// ---------------------------------------------------------------- hover

// Pointer position over a track, relative to the chart (for the tooltip).
type Hover = {
  rowId: string;
  time: number;
  x: number;
  y: number;
  chartWidth: number;
};

// Width of an element, kept up to date (for which icons fit). A callback
// ref, so an element that mounts after the first render is still measured.
const useElementWidth = <T extends HTMLElement>() => {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(DEFAULT_PLOT_WIDTH);
  useEffect(() => {
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width))
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
};

// ---------------------------------------------------------------- track

// Bars too narrow for their icon get it centered on top, overflowing the
// bar; one that would cover the previous icon of the row is left out.
const getCenteredIcons = (
  segments: ActivitySegment[],
  duration: number,
  plotWidth: number
): number[] => {
  const toPx = (seconds: number) => (seconds / duration) * plotWidth;
  const centers: number[] = [];
  let lastIconEnd = Number.NEGATIVE_INFINITY;
  segments.forEach((segment) => {
    const startPx = toPx(segment.start);
    const widthPx = toPx(segment.end - segment.start);
    if (widthPx >= TRACK_ICON_SIZE + 4) {
      // Its icon sits at its start, inside the bar.
      lastIconEnd = startPx + 2 + TRACK_ICON_SIZE;
      return;
    }
    const center = segment.start + (segment.end - segment.start) / 2;
    const half = (TRACK_ICON_SIZE - 2) / 2;
    if (toPx(center) - half < lastIconEnd) {
      return;
    }
    centers.push(center);
    lastIconEnd = toPx(center) + half;
  });
  return centers;
};

type TrackProps = {
  display: RowDisplay;
  character: CharacterData;
  duration: number;
  plotWidth: number;
  hover: Hover | null;
  onHover: (event: MouseEvent<HTMLDivElement>, rowId: string) => void;
};

const ActivityTrack = ({
  display,
  character,
  duration,
  plotWidth,
  hover,
  onHover,
}: TrackProps) => {
  const { row, segments, clusters } = display;
  const color = getColor(row);
  const secondsPerPixel = duration / plotWidth;
  const hovered =
    hover?.rowId === row.id
      ? findHoverTarget(display, hover.time, secondsPerPixel, TRACK_ICON_SIZE)
      : null;
  const centeredIcons = getCenteredIcons(segments, duration, plotWidth);
  const cursorValue = hover
    ? getValueAt(display, hover.time, secondsPerPixel, TRACK_ICON_SIZE)
    : null;

  return (
    <div
      data-testid={`activity-track-${row.id}`}
      className='relative h-5 rounded-sm bg-muted/60'
      onMouseMove={(event) => onHover(event, row.id)}
    >
      {row.points && (
        <svg
          viewBox='0 0 100 10'
          preserveAspectRatio='none'
          className='absolute inset-0 size-full overflow-hidden rounded-sm text-sky-500'
          aria-label={`${row.label} over time`}
          role='img'
        >
          <path
            d={getResourcePath(row, duration)}
            className='fill-current opacity-30'
          />
        </svg>
      )}
      {/* While the pointer is anywhere on the chart, every row reads what
          it has at that moment next to the cursor line. */}
      {cursorValue && hover && (
        <span
          data-testid={`activity-value-${row.id}`}
          className={cn(
            'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 rounded bg-background/90 px-1 text-[10px] max-w-56 truncate font-semibold whitespace-nowrap tabular-nums shadow-sm ring-1',
            row.points
              ? 'text-sky-600 ring-sky-500/40 dark:text-sky-300'
              : 'text-foreground ring-foreground/20',
            // Flip to the left of the line near the right edge.
            hover.time / duration > 0.75 ? '-ml-1 -translate-x-full' : 'ml-1'
          )}
          style={{ left: toPercent(hover.time, duration) }}
        >
          {cursorValue}
        </span>
      )}

      {segments.map((segment) => {
        const widthPx = ((segment.end - segment.start) / duration) * plotWidth;
        const isHovered =
          hovered?.kind === 'segment' && hovered.segment === segment;
        // Strong tint: it dealt DMG; faint: up without DMG of its own.
        const dealtDamage = (segment.damage ?? 0) > 0;
        return (
          <span
            key={segment.start}
            aria-label={`${row.label} ${formatRange(
              segment.start,
              segment.end
            )}`}
            className={cn(
              'absolute inset-y-0 flex items-center overflow-hidden rounded-sm',
              isHovered && 'ring-1 ring-foreground/60'
            )}
            style={{
              left: toPercent(segment.start, duration),
              width: `max(2px, ${toPercent(
                segment.end - segment.start,
                duration
              )})`,
            }}
          >
            <span
              className={cn(
                'absolute inset-0',
                color,
                dealtDamage ? 'opacity-30' : 'opacity-15'
              )}
            />
            <span className={cn('absolute inset-y-0 left-0 w-0.5', color)} />
            {/* Narrower bars get their icon centered on top (below). */}
            {widthPx >= TRACK_ICON_SIZE + 4 && (
              <span className='relative ml-0.5 flex items-center gap-1'>
                <RowIcon
                  row={row}
                  character={character}
                  size={TRACK_ICON_SIZE}
                />
                {segment.uses > 1 && widthPx > TRACK_ICON_SIZE + 22 && (
                  <span className='text-[10px] font-medium tabular-nums'>
                    ×{segment.uses}
                  </span>
                )}
              </span>
            )}
          </span>
        );
      })}

      {centeredIcons.map((center) => (
        <span
          key={center}
          className='pointer-events-none absolute top-1/2 z-[1] flex -translate-x-1/2 -translate-y-1/2'
          style={{ left: toPercent(center, duration) }}
        >
          <RowIcon row={row} character={character} size={TRACK_ICON_SIZE - 2} />
        </span>
      ))}

      {/* Events during a segment (stacks added) are thin lines, so they do
          not cover its icon. */}
      {segments.length > 0 &&
        row.marks.map((mark, index) => (
          <span
            key={`${mark}-${index}`}
            className={cn('absolute inset-y-1 w-px opacity-70', color)}
            style={{ left: toPercent(mark, duration) }}
          />
        ))}

      {segments.length === 0 &&
        clusters.map((cluster) => {
          const isHovered =
            hovered?.kind === 'marks' && hovered.cluster === cluster;
          return (
            <Fragment key={cluster.start}>
              {/* A group of events spans a stretch: a faint band with its
                  ticks, under the icon at its first event. */}
              {cluster.count > 1 && (
                <span
                  className='absolute inset-y-1 overflow-hidden rounded-sm'
                  style={{
                    left: toPercent(cluster.start, duration),
                    width: toPercent(cluster.end - cluster.start, duration),
                  }}
                >
                  <span className={cn('absolute inset-0 opacity-15', color)} />
                </span>
              )}
              {/* Dense groups (a refresh every few frames) are just the
                  band and the count. */}
              {cluster.count > 1 &&
                cluster.count <= MAX_TICKS_PER_CLUSTER &&
                row.marks
                  .filter(
                    (mark) => mark >= cluster.start && mark <= cluster.end
                  )
                  .map((mark, index) => (
                    <span
                      key={`${mark}-${index}`}
                      className={cn(
                        'absolute inset-y-1.5 w-px opacity-60',
                        color
                      )}
                      style={{ left: toPercent(mark, duration) }}
                    />
                  ))}
              <span
                aria-label={`${row.label} fired ${formatRange(
                  cluster.start,
                  cluster.end
                )}`}
                className={cn(
                  'absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full',
                  isHovered && 'ring-1 ring-foreground/60'
                )}
                style={{ left: toPercent(cluster.start, duration) }}
              >
                <RowIcon
                  row={row}
                  character={character}
                  size={TRACK_ICON_SIZE - 2}
                />
                {cluster.count > 1 && (
                  <span className='absolute -top-1 -right-1.5 rounded-full bg-foreground px-0.5 text-[8px] leading-tight font-semibold text-background tabular-nums'>
                    {cluster.count}
                  </span>
                )}
              </span>
            </Fragment>
          );
        })}

      {hover && (
        <span
          className='pointer-events-none absolute -inset-y-0.5 w-px bg-foreground/40'
          style={{ left: toPercent(hover.time, duration) }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------- chart

// What ran during the simulation: one row per action and per block, with
// icons where it was up and a tooltip with its numbers.
const ActivityTimeline = ({ outcome }: ActivityTimelineProps) => {
  const { duration } = outcome;
  const character = getCharacterData(outcome.characterId);
  const sectionRef = useRef<HTMLElement>(null);
  const [plotRef, plotWidth] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);

  const rows = useMemo(() => {
    const rotation = CHARACTERS[outcome.characterId]?.rotation;
    return buildActivityRows({
      trace: outcome.rotationTrace ?? [],
      activity: outcome.activity,
      hits: outcome.context.hitLog,
      actions: rotation ? getRotationActions(rotation) : [],
      duration,
    });
  }, [outcome, duration]);

  // Events closer than an icon share one.
  const displays = useMemo(
    () =>
      rows.map((row) => ({
        row,
        segments: getSegments(row.spans),
        clusters: getMarkClusters(
          row.marks,
          duration,
          (TRACK_ICON_SIZE + 2) / plotWidth
        ),
      })),
    [rows, duration, plotWidth]
  );

  if (rows.length === 0 || duration <= 0) {
    return null;
  }

  const handleHover = (event: MouseEvent<HTMLDivElement>, rowId: string) => {
    const track = event.currentTarget.getBoundingClientRect();
    const section = sectionRef.current?.getBoundingClientRect();
    const ratio = (event.clientX - track.left) / Math.max(1, track.width);
    setHover({
      rowId,
      time: Math.min(duration, Math.max(0, ratio * duration)),
      x: event.clientX - (section?.left ?? 0),
      y: track.top - (section?.top ?? 0),
      chartWidth: section?.width ?? track.width,
    });
  };

  const hoveredDisplay = displays.find(
    (display) => display.row.id === hover?.rowId
  );
  const hoveredDescription = hoveredDisplay?.row.block
    ? getBlockDescription(character, hoveredDisplay.row.block)
    : null;
  const hoverTarget =
    hover && hoveredDisplay
      ? findHoverTarget(
          hoveredDisplay,
          hover.time,
          duration / plotWidth,
          TRACK_ICON_SIZE
        )
      : null;

  return (
    <section
      ref={sectionRef}
      data-testid='activity-timeline'
      className='relative mt-3 min-w-0'
      onMouseLeave={() => setHover(null)}
    >
      <div className='mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <h3 className='text-xs font-semibold'>Activity over time</h3>
        <p className='text-[11px] text-muted-foreground'>
          Strong tint: dealt DMG · faint: active without DMG · hover for details
        </p>
      </div>

      <div className='space-y-2'>
        {ACTIVITY_GROUPS.map((group) => {
          const groupDisplays = displays.filter(
            (display) => display.row.group === group.id
          );
          if (groupDisplays.length === 0) {
            return null;
          }
          return (
            <div key={group.id} data-testid={`activity-group-${group.id}`}>
              <div className='mb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase'>
                {group.label}
              </div>
              <div className='space-y-1'>
                {groupDisplays.map((display) => (
                  <div
                    key={display.row.id}
                    data-testid={`activity-row-${display.row.id}`}
                    className={ROW_GRID}
                  >
                    <span
                      title={getRowTitle(display.row, character)}
                      className={cn(
                        'flex min-w-0 items-center gap-1.5 text-[11px]',
                        isIdle(display.row) &&
                          'text-muted-foreground opacity-60'
                      )}
                    >
                      <RowIcon
                        row={display.row}
                        character={character}
                        size={LABEL_ICON_SIZE}
                      />
                      <span className='truncate'>{display.row.label}</span>
                    </span>
                    <ActivityTrack
                      display={display}
                      character={character}
                      duration={duration}
                      plotWidth={plotWidth}
                      hover={hover}
                      onHover={handleHover}
                    />
                    <span className='text-right text-[11px] text-muted-foreground tabular-nums'>
                      {getSummary(display.row)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className={ROW_GRID}>
          <span />
          <div ref={plotRef} className='relative h-4'>
            {getTimeTicks(duration).map((seconds) => (
              <span
                key={seconds}
                className='absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums'
                style={{ left: toPercent(seconds, duration) }}
              >
                {seconds}s
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>

      {hover && hoveredDisplay && hoverTarget && (
        <div
          data-testid='activity-tooltip'
          className='pointer-events-none absolute z-20 w-max max-w-72 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1.5 text-[11px] leading-snug shadow-md'
          style={{
            left: Math.min(
              hover.chartWidth - TOOLTIP_HALF_WIDTH,
              Math.max(TOOLTIP_HALF_WIDTH, hover.x)
            ),
            top: hover.y - 4,
          }}
        >
          <div className='mb-0.5 flex items-center gap-1.5 font-semibold'>
            <RowIcon
              row={hoveredDisplay.row}
              character={character}
              size={LABEL_ICON_SIZE}
            />
            {hoveredDisplay.row.label}
          </div>
          {getTooltipLines(hoveredDisplay.row, hoverTarget).map((line) => (
            <div key={line} className='text-muted-foreground tabular-nums'>
              {line}
            </div>
          ))}
          {hoveredDescription && (
            <div className='mt-1 border-t pt-1 text-muted-foreground'>
              {hoveredDescription}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ActivityTimeline;
