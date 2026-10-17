import { useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronDown,
  HeartPulse,
  LucideIcon,
  Plus,
  ShieldPlus,
  Sparkle,
  Swords,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import {
  CSSProperties,
  memo,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

import { MemberColor } from './memberColors';
import { currentPointerX, payloadOf, TRACKS_DROP_ID } from './rotationDnd';
import { Ruler } from './ruler';
import { SOURCE_STYLES, SourceKind, sourceKindOfChip } from './sourceStyles';
import {
  ActionGroup,
  actionTitle,
  describeTrigger,
  DragPayload,
  dropBefore,
  dropSlot,
  hitsOfGroup,
  isReactionHit,
  meterAt,
  systemEventRows,
} from './timelineData';
import { HeaderMember } from './TimelineHeader';
import { TipCard, TipStat, TipText, TipTime } from './TimelineTooltip';
import RotationActionIcon from '../rotation/RotationActionIcon';
import { getLoadedCharacter } from '../../_lib/characterData';
import { splitTeamActionId } from '../../_lib/engine/simulateTeam';
import formatNumber from '../../_lib/formatNumber';
import { FRAMES_PER_SECOND } from '../../_lib/frames';
import { elementIconUrl } from '../../_lib/genshinIcons';
import { ActionPiece, BlockType, InspectorView } from '../../_lib/inspector';
import { RotationAction } from '../../_lib/rotation/rotationSchema';

export const LABEL_PX = 200;
const AXIS_PX = 20;
const ICON_PX = 20;
// A skipped block's marker (it takes no time).
const SKIPPED_PX = 26;
// Edit mode: the ghost of a dragged block where it will land.
const PLACEHOLDER_PX = 36;

type DropSlot = { time: number; actionId: string };
// Labeled ticks at least this far apart; the step grows as the zoom
// shrinks.
const MAJOR_MIN_PX = 80;
const TICK_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30];
// Pan by dragging only after this much movement (less is a click).
const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM = 0.0015;
// Following the playhead: how close to an edge it gets before the view
// moves with it.
const FOLLOW_MARGIN_PX = 120;
// Dragging the playhead: the edge zone that pans, and its top speed (px
// per frame).
const EDGE_PX = 56;
const EDGE_SPEED_PX = 18;
// Half the playhead's label width.
const HEAD_HALF_PX = 32;

// Blocks that last a while, drawn as bars in Buffs & Debuffs.
const SPAN_TYPES = new Set<BlockType>([
  'bonus',
  'debuff',
  'state',
  'nightsoul',
  'bondOfLife',
]);

export type TimelineMember = HeaderMember & {
  slot: number;
  color: MemberColor;
};

type TimelineChartProps = {
  view: InspectorView;
  // The actions' blocks: each press, or each Normal Attack combo as one.
  actions: ActionGroup[];
  members: TimelineMember[];
  actionsById: Map<string, RotationAction>;
  time: number;
  ruler: Ruler;
  pxPerSecond: number;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  // Zoom by a factor (the chart keeps the point under the pointer, or the
  // playhead, where it was).
  onZoom: (factor: number) => void;
  // The width the tracks have on screen (for Fit).
  onTrackWidthChange: (width: number) => void;
  // Edit mode (when `onSelectBlock` is set): the block picked, picking one
  // (a click on it), and a drop on the tracks: before that block (null: at
  // the end).
  selectedBlock?: string | null;
  onSelectBlock?: (blockUid: string) => void;
  onDropBlock?: (payload: DragPayload, beforeUid: string | null) => void;
  // Seconds the axis shows: the run's, plus room to add blocks in edit
  // mode.
  axisSeconds?: number;
};

// The ruler's labels and the playhead's, in seconds (a run is never
// longer than a few minutes): "12s", "12.5s"; the playhead to the frame.
const tickLabel = (value: number) =>
  `${formatNumber(Math.round(value * 100) / 100)}s`;
const playheadLabel = (value: number) => `${value.toFixed(3)}s`;

const seconds = (value: number) =>
  `${formatNumber(Math.round(value * 100) / 100)} s`;

type Bar = { key: string; start: number; end: number; title: ReactNode };
type Mark = { key: string; time: number; title: ReactNode };

type Row = {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

type Group = { id: string; title: string; Icon: LucideIcon; rows: Row[] };

const RowIcon = ({ src, size = 18 }: { src: string | null; size?: number }) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=''
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  ) : (
    <Sparkle
      style={{ width: size, height: size }}
      className='text-slate-400'
      aria-hidden
    />
  );

// The timeline has one tooltip for every block: a block only names its
// tip (`data-tip`), and the chart shows that tip's card where the pointer
// is (see HoverTip). Hundreds of tooltips would each cost a component.
type Tips = Map<string, ReactNode>;

const KIND_LABELS: Record<string, string> = {
  normal: 'Normal Attack',
  charged: 'Charged Attack',
  plunge: 'Plunge',
  skill: 'Elemental Skill',
  burst: 'Elemental Burst',
  move: 'Move',
  dodge: 'Dodge',
  wait: 'Wait',
};

const ElementIcon = ({
  element,
  size = 14,
}: {
  element: string;
  size?: number;
}) => {
  const src = elementIconUrl(element);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=''
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  ) : null;
};

const ElementList = ({ elements }: { elements: string[] }) => (
  <span className='inline-flex items-center gap-1.5'>
    {elements.map((element) => (
      <span key={element} className='inline-flex items-center gap-1'>
        <ElementIcon element={element} />
        {element}
      </span>
    ))}
  </span>
);

const Bars = ({
  bars,
  ruler,
  colorClass,
}: {
  bars: Bar[];
  ruler: Ruler;
  colorClass: string;
}) => (
  <>
    {bars.map((bar) => (
      <span
        key={bar.key}
        data-tip={`b:${bar.key}`}
        className={cn(
          'absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full opacity-80 ring-1 ring-white/10',
          colorClass
        )}
        style={{
          left: ruler.toX(bar.start),
          width: Math.max(4, ruler.toX(bar.end) - ruler.toX(bar.start)),
        }}
      />
    ))}
  </>
);

const Marks = ({
  marks,
  prefix,
  ruler,
  children,
}: {
  marks: Mark[];
  // Its row's tip prefix (keys are only unique within a row).
  prefix: string;
  ruler: Ruler;
  children: ReactNode;
}) => (
  <>
    {marks.map((mark) => (
      <span
        key={mark.key}
        data-tip={`${prefix}${mark.key}`}
        className='absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2'
        style={{ left: ruler.toX(mark.time) }}
      >
        {children}
      </span>
    ))}
  </>
);

const MarkDot = ({
  className,
  Icon,
}: {
  className: string;
  Icon: LucideIcon;
}) => (
  <span
    className={cn(
      'flex size-4 items-center justify-center rounded-full ring-1',
      className
    )}
  >
    <Icon className='size-2.5' strokeWidth={3} />
  </span>
);

// An action on the chart. In edit mode it drags (dnd-kit): to move its
// block, or onto the trash; the chart stays in place under it.
const DraggableAction = ({
  dragId,
  blockUid,
  editing,
  tipKey,
  selected,
  className,
  style,
  children,
}: {
  dragId: string;
  blockUid: string;
  editing: boolean;
  tipKey: string;
  selected: boolean;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `block:${dragId}`,
    data: { kind: 'move', blockUid } satisfies DragPayload,
    disabled: !editing,
  });
  return (
    <span
      ref={setNodeRef}
      {...(editing ? { ...listeners, ...attributes } : {})}
      data-tip={tipKey}
      data-testid='timeline-action'
      data-block-uid={blockUid}
      data-selected={selected || undefined}
      // A click picks the block without focusing it: the browser would
      // scroll the tracks to show the focused block.
      onMouseDown={editing ? (event) => event.preventDefault() : undefined}
      className={cn(
        className,
        editing && 'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
      style={style}
    >
      {children}
    </span>
  );
};

// The rows: rebuilt only when the run or the zoom change, never with the
// cursor.
const buildGroups = (
  view: InspectorView,
  chartActions: ActionGroup[],
  members: TimelineMember[],
  actionsById: Map<string, RotationAction>,
  ruler: Ruler,
  selectedBlock: string | null,
  editing: boolean,
  slot: DropSlot | null
): { groups: Group[]; tips: Tips } => {
  // Every block's tip card, by its `data-tip`.
  const tips: Tips = new Map();
  const slotOf = new Map(members.map((member) => [member.characterId, member]));
  const nameOf = (id: string) => slotOf.get(id)?.name ?? id;
  const ownerOf = (id: string) => slotOf.get(id) ?? null;
  // The talent of the action that made a block (its play's cause id).
  const kindByCause = new Map(
    view.actions.map((action) => [
      action.causeId,
      actionsById.get(action.actionId)?.kind,
    ])
  );
  const causeKindOf = (cause: string | null | undefined) =>
    cause ? kindByCause.get(cause) : undefined;
  const accentOf = (id: string) => slotOf.get(id)?.color.bar ?? 'bg-slate-400';
  // "Chevreuse: Elemental Burst" → "Elemental Burst" (the card shows whose).
  const actionName = (action: ActionPiece | ActionGroup) =>
    actionTitle(action, actionsById.get(action.actionId));
  const actionIcon = (action: ActionPiece, size = 30) => {
    const rotationAction = actionsById.get(action.actionId);
    return rotationAction ? (
      <RotationActionIcon
        action={rotationAction}
        size={size}
        className='bg-transparent p-0 ring-0'
      />
    ) : (
      <Swords className='size-5 text-slate-400' />
    );
  };
  // The cost in the character file (`energyCost` of the talent).
  const energyCostOf = (action: ActionPiece) =>
    getLoadedCharacter(action.characterId).actions[
      splitTeamActionId(action.actionId).actionId
    ]?.energyCost ?? null;
  const actionTip = (action: ActionGroup) => {
    const kind = actionsById.get(action.actionId)?.kind;
    const hits = hitsOfGroup(view, action);
    const damage = hits.reduce((total, hit) => total + hit.damage, 0);
    const crits = hits.filter((hit) => hit.isCrit).length;
    const elements = Array.from(new Set(hits.map((hit) => hit.element)));
    return (
      <TipCard
        icon={actionIcon(action)}
        title={actionName(action)}
        owner={ownerOf(action.characterId)}
        badge={kind ? KIND_LABELS[kind] ?? kind : null}
        accentClass={accentOf(action.characterId)}
      >
        <TipTime start={action.start} end={action.end} />
        {warningsOf(action).map((warning) => (
          <p
            key={warning}
            data-testid='timeline-action-warning'
            className='mt-1 flex items-start gap-1 text-[11px] text-amber-300'
          >
            <TriangleAlert className='mt-px size-3 shrink-0' />
            {warning}
          </p>
        ))}
        {hits.length > 0 ? (
          <>
            <TipStat label='Hits' value={hits.length} />
            <TipStat
              label='Total DMG'
              value={formatNumber(damage)}
              className='text-amber-300'
            />
            <TipStat
              label='CRITs'
              value={`${crits} / ${hits.length}`}
              className={crits > 0 ? 'text-rose-300' : undefined}
            />
            <TipStat
              label='Element'
              value={<ElementList elements={elements} />}
            />
          </>
        ) : (
          <TipStat label='Hits' value='None' className='text-slate-400' />
        )}
      </TipCard>
    );
  };

  // A block's warnings (each once): on cooldown, waited for one, no Energy…
  const warningsOf = (action: ActionGroup) =>
    Array.from(
      new Set(
        action.parts.flatMap((part) => (part.warning ? [part.warning] : []))
      )
    );

  const actionRows: Row[] = members.map((member) => {
    const actions = chartActions.filter(
      (action) => action.characterId === member.characterId
    );
    return {
      id: `action-${member.characterId}`,
      label: member.name,
      icon: (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatar}
          alt=''
          width={22}
          height={22}
          className='size-[22px] rounded-full bg-slate-700'
        />
      ),
      content: actions.map((action) => {
        const rotationAction = actionsById.get(action.actionId);
        tips.set(`a:${action.key}`, actionTip(action));
        const skipped = action.parts.every((part) => part.skipped);
        // A block starts where it was put: its wait for a cooldown first
        // (dead time, grey), then the action. A skipped one takes no time:
        // a marker on top (the next block starts there too).
        const from = ruler.toStartX(action.start - action.waited);
        const left = skipped ? ruler.toX(action.start) - SKIPPED_PX / 2 : from;
        const width = skipped ? SKIPPED_PX : ruler.toX(action.end) - from;
        const waitWidth = skipped ? 0 : ruler.toStartX(action.start) - from;
        const warned = warningsOf(action).length > 0;
        return (
          <DraggableAction
            key={action.key}
            dragId={action.key}
            blockUid={action.blockUid}
            editing={editing}
            tipKey={`a:${action.key}`}
            selected={action.blockUid === selectedBlock}
            className={cn(
              'absolute top-1/2 flex h-6 -translate-y-1/2 items-center justify-center overflow-hidden rounded-md border shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-colors hover:brightness-125',
              // The member's own color, in its shade for the action's kind.
              (rotationAction && member.color.kinds[rotationAction.kind]) ??
                member.color.chip,
              // Not performed (on cooldown…): kept in its place, on top.
              skipped &&
                'z-10 rounded-full border-dashed border-amber-400 bg-slate-900',
              action.blockUid === selectedBlock &&
                'ring-2 ring-sky-400 ring-offset-1 ring-offset-slate-950'
            )}
            // The ruler leaves a gap before the next action; `from` is
            // on its far side, so back-to-back blocks never touch.
            style={{ left, width }}
          >
            {waitWidth > 0 && (
              <span
                data-testid='timeline-action-waiting'
                aria-hidden
                className='pointer-events-none absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,var(--color-zinc-600)_0_4px,var(--color-zinc-700)_4px_8px)]'
                style={{ width: waitWidth }}
              />
            )}
            {/* The action's own part (after its wait). */}
            <span
              className='relative flex h-full flex-1 items-center justify-center'
              style={waitWidth > 0 ? { marginLeft: waitWidth } : undefined}
            >
              {rotationAction ? (
                <RotationActionIcon
                  action={rotationAction}
                  size={ICON_PX}
                  className='bg-transparent p-0 ring-0 drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]'
                />
              ) : (
                <span className='size-2 rounded-full bg-current opacity-60' />
              )}
            </span>
            {warned && (
              <TriangleAlert
                data-testid='timeline-action-warned'
                aria-label='Warning'
                className='absolute top-0 right-0 size-2.5 fill-amber-400 text-slate-950'
              />
            )}
          </DraggableAction>
        );
      }),
    };
  });
  // Edit mode: where the block being dragged will land, as a ghost of it
  // in its member's row (between the blocks it goes between).
  if (slot) {
    const owner = splitTeamActionId(slot.actionId).characterId;
    const ghost = actionsById.get(slot.actionId);
    const row = actionRows.find((entry) => entry.id === `action-${owner}`);
    if (row && ghost) {
      row.content = (
        <>
          {row.content}
          <span
            aria-hidden
            data-testid='timeline-drop-placeholder'
            className='pointer-events-none absolute top-1/2 z-20 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border-2 border-dashed border-sky-400 bg-sky-500/25 shadow-[0_0_8px_rgb(56_189_248/0.6)]'
            style={{ left: ruler.toX(slot.time), width: PLACEHOLDER_PX }}
          >
            <RotationActionIcon
              action={ghost}
              size={ICON_PX}
              className='bg-transparent p-0 ring-0 opacity-80'
            />
          </span>
        </>
      );
    }
  }

  // One row per block (owner and name), with every time it was up.
  const spans = new Map<
    string,
    { label: string; iconUrl: string | null; kind: SourceKind; bars: Bar[] }
  >();
  view.chips.forEach((chip) => {
    if (
      chip.hidden ||
      !SPAN_TYPES.has(chip.type) ||
      (chip.kind !== 'status' && chip.kind !== 'stacks')
    ) {
      return;
    }
    const rowKey = `${chip.characterId}|${chip.label}`;
    const row = spans.get(rowKey) ?? {
      label: chip.label,
      iconUrl: chip.iconUrl,
      kind: sourceKindOfChip(chip, causeKindOf(chip.cause)),
      bars: [],
    };
    const parts =
      chip.renewals && chip.renewals.length > 0
        ? chip.renewals.map((renewal) => ({
            start: renewal.start,
            end: renewal.end ?? renewal.until ?? view.duration,
          }))
        : [{ start: chip.start, end: chip.end ?? view.duration }];
    parts.forEach((part, index) =>
      row.bars.push({
        key: `${chip.key}-${index}`,
        ...part,
        title: (
          <TipCard
            icon={<RowIcon src={chip.iconUrl} size={28} />}
            title={chip.label}
            owner={ownerOf(chip.characterId)}
            badge={chip.sourceTag}
            value={chip.value}
            accentClass={accentOf(chip.characterId)}
          >
            <TipTime start={part.start} end={part.end} />
            {chip.meter && (
              // Timed by a resource: up while it meets its bound.
              <TipStat
                label='While'
                value={`${chip.meter.label} ${
                  meterAt(chip.meter, part.start).bound
                }`}
                className='text-sky-300'
              />
            )}
            {parts.length > 1 && (
              <TipStat
                label='Application'
                value={`${index + 1} of ${parts.length}`}
              />
            )}
            {chip.kind === 'stacks' && chip.stacks && (
              <TipStat
                label='Stacks'
                value={`${chip.stacks.length}${
                  chip.max ? ` (max ${chip.max})` : ''
                }`}
              />
            )}
            {chip.holder && chip.holder !== chip.characterId && (
              <TipStat label='Held by' value={nameOf(chip.holder)} />
            )}
            {(chip.sourceText || chip.effect) && (
              <TipText title={chip.sourceName}>
                {chip.sourceText ?? chip.effect}
              </TipText>
            )}
          </TipCard>
        ),
      })
    );
    spans.set(rowKey, row);
  });
  spans.forEach((row) =>
    row.bars.forEach((bar) => tips.set(`b:${bar.key}`, bar.title))
  );
  const buffRows: Row[] = Array.from(spans.entries()).map(([key, row]) => ({
    id: `buff-${key}`,
    label: row.label,
    icon: <RowIcon src={row.iconUrl} />,
    content: (
      <Bars
        bars={row.bars}
        ruler={ruler}
        colorClass={SOURCE_STYLES[row.kind].bar}
      />
    ),
  }));

  // A weapon's, set's or constellation's change to a special system (Crimson
  // Moon's Semblance granting Bond of Life): a row of its own, a mark each
  // time, in the source's color.
  const systemRows: Row[] = systemEventRows(view).map((row) => {
    const prefix = `s:${row.key}:`;
    const kind = sourceKindOfChip(
      row.chips[0],
      causeKindOf(row.chips[0].cause)
    );
    const marks: Mark[] = row.chips.map((chip) => ({
      key: chip.key,
      time: chip.start,
      title: (
        <TipCard
          icon={<RowIcon src={chip.iconUrl} size={28} />}
          title={chip.label}
          owner={ownerOf(chip.characterId)}
          badge={chip.sourceTag}
          accentClass={accentOf(chip.characterId)}
        >
          <TipTime start={chip.start} />
          {describeTrigger(chip.characterId, chip.blockId).map((line) => (
            <p key={line} className='text-[11px] text-slate-300'>
              {line}
            </p>
          ))}
          {chip.sourceText && (
            <TipText title={chip.sourceName}>{chip.sourceText}</TipText>
          )}
        </TipCard>
      ),
    }));
    marks.forEach((mark) => tips.set(`${prefix}${mark.key}`, mark.title));
    return {
      id: `system-${row.key}`,
      label: row.label,
      icon: <RowIcon src={row.iconUrl} />,
      content: (
        <Marks marks={marks} prefix={prefix} ruler={ruler}>
          <MarkDot
            className={cn(SOURCE_STYLES[kind].chip, 'ring-current')}
            Icon={Sparkle}
          />
        </Marks>
      ),
    };
  });

  const gains: Mark[] = view.chips
    .filter((chip) => chip.kind === 'particles' && !chip.hidden)
    .map((chip) => ({
      key: chip.key,
      time: chip.end ?? chip.start,
      title: (
        <TipCard
          icon={
            <ElementIcon
              element={String(chip.value ?? '').split(' ')[1] ?? ''}
              size={26}
            />
          }
          title={chip.value ?? 'Particles'}
          owner={ownerOf(chip.characterId)}
          badge='Energy'
          accentClass={accentOf(chip.characterId)}
        >
          <TipStat label='Made by' value={chip.label} />
          <TipStat label='Generated' value={seconds(chip.start)} />
          <TipStat
            label='Caught'
            value={seconds(chip.end ?? chip.start)}
            className='text-sky-300'
          />
          <TipStat
            label='Flight time'
            value={seconds((chip.end ?? chip.start) - chip.start)}
          />
        </TipCard>
      ),
    }));
  const costs: Mark[] = view.actions
    .filter((action) => actionsById.get(action.actionId)?.kind === 'burst')
    .map((action) => ({
      key: action.key,
      time: action.start,
      title: (
        <TipCard
          icon={actionIcon(action)}
          title={actionName(action)}
          owner={ownerOf(action.characterId)}
          badge='Energy spent'
          accentClass={accentOf(action.characterId)}
        >
          <TipTime start={action.start} />
          <TipStat
            label='Energy cost'
            value={energyCostOf(action) ?? '—'}
            className='text-fuchsia-300'
          />
        </TipCard>
      ),
    }));
  const energyRows: Row[] = [
    {
      id: 'energy-gain',
      label: 'Energy Gain',
      icon: <Zap className='size-[18px] text-sky-400' aria-hidden />,
      content: (
        <Marks marks={gains} prefix='g:' ruler={ruler}>
          <MarkDot
            className='bg-sky-500/30 text-sky-300 ring-sky-400/60'
            Icon={Zap}
          />
        </Marks>
      ),
      count: gains.length,
    },
    {
      id: 'energy-cost',
      label: 'Energy Cost',
      icon: <Sparkle className='size-[18px] text-fuchsia-400' aria-hidden />,
      content: (
        <Marks marks={costs} prefix='c:' ruler={ruler}>
          <MarkDot
            className='bg-fuchsia-500/30 text-fuchsia-300 ring-fuchsia-400/60'
            Icon={Sparkle}
          />
        </Marks>
      ),
      count: costs.length,
    },
  ]
    .filter((row) => row.count > 0)
    .map(({ count: _count, ...row }) => row);

  const heals: Mark[] = view.chips
    .filter((chip) => chip.kind === 'heal' && !chip.hidden)
    .flatMap((chip) =>
      (chip.ticks ?? [chip.start]).map((tick, index) => ({
        key: `${chip.key}-${index}`,
        time: tick,
        title: (
          <TipCard
            icon={
              chip.iconUrl ? (
                <RowIcon src={chip.iconUrl} size={28} />
              ) : (
                <Plus className='size-5 text-emerald-400' />
              )
            }
            title={chip.label}
            owner={ownerOf(chip.characterId)}
            badge={chip.sourceTag}
            value={chip.short}
            accentClass={accentOf(chip.characterId)}
          >
            <TipTime start={tick} />
            <TipStat
              label='Heals'
              value={chip.healed ? nameOf(chip.healed) : 'Whole party'}
            />
            {(chip.ticks?.length ?? 0) > 1 && (
              <TipStat
                label='Tick'
                value={`${index + 1} of ${chip.ticks?.length}`}
              />
            )}
            {chip.effect && <TipText>{chip.effect}</TipText>}
          </TipCard>
        ),
      }))
    );
  const seen = new Set<string>();
  const reactions: Mark[] = view.hits
    .filter((hit) => hit.reaction !== 'None')
    .filter((hit) => {
      const key = `${hit.time}|${hit.reaction}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((hit) => ({
      key: `${hit.characterId}-${hit.index}`,
      time: hit.time,
      title: (
        <TipCard
          icon={<ElementIcon element={hit.element} size={26} />}
          title={hit.reaction}
          owner={ownerOf(hit.characterId)}
          badge='Reaction'
          value={isReactionHit(hit) ? `${formatNumber(hit.damage)} DMG` : null}
          accentClass={accentOf(hit.characterId)}
        >
          <TipTime start={hit.time} />
          <TipStat label='Triggered by' value={hit.label} />
          <TipStat
            label='Element'
            value={<ElementList elements={[hit.element]} />}
          />
          {!isReactionHit(hit) && (
            <TipStat label='Hit DMG' value={formatNumber(hit.damage)} />
          )}
        </TipCard>
      ),
    }));
  (
    [
      ['g:', gains],
      ['c:', costs],
      ['h:', heals],
      ['r:', reactions],
    ] as const
  ).forEach(([prefix, marks]) =>
    marks.forEach((mark) => tips.set(`${prefix}${mark.key}`, mark.title))
  );
  const otherRows: Row[] = [
    {
      id: 'healing',
      label: 'Healing',
      icon: <Plus className='size-[18px] text-emerald-400' aria-hidden />,
      content: (
        <Marks marks={heals} prefix='h:' ruler={ruler}>
          <MarkDot
            className='bg-emerald-500/30 text-emerald-300 ring-emerald-400/60'
            Icon={Plus}
          />
        </Marks>
      ),
      count: heals.length,
    },
    {
      id: 'reactions',
      label: 'Reactions',
      icon: <Zap className='size-[18px] text-violet-400' aria-hidden />,
      content: (
        <Marks marks={reactions} prefix='r:' ruler={ruler}>
          <MarkDot
            className='bg-violet-500/30 text-violet-200 ring-violet-400/60'
            Icon={Zap}
          />
        </Marks>
      ),
      count: reactions.length,
    },
  ]
    .filter((row) => row.count > 0)
    .map(({ count: _count, ...row }) => row);

  const groups = [
    {
      id: 'actions',
      title: 'Character Actions',
      Icon: Swords,
      rows: actionRows,
    },
    {
      id: 'buffs',
      title: 'Buffs & Debuffs',
      Icon: ShieldPlus,
      rows: [...buffRows, ...systemRows],
    },
    {
      id: 'energy',
      title: 'Energy & Particles',
      Icon: Zap,
      rows: energyRows,
    },
    {
      id: 'other',
      title: 'Healing & Other Events',
      Icon: HeartPulse,
      rows: otherRows,
    },
  ].filter((group) => group.rows.length > 0);
  return { groups, tips };
};

type Ticks = { major: number[]; minor: number[] };

const buildTicks = (duration: number, pxPerSecond: number): Ticks => {
  const step =
    TICK_STEPS.find((entry) => entry * pxPerSecond >= MAJOR_MIN_PX) ??
    TICK_STEPS[TICK_STEPS.length - 1];
  const minorStep = step / 5;
  const major: number[] = [];
  const minor: number[] = [];
  const count = Math.floor(duration / minorStep + 1e-6);
  for (let index = 0; index <= count; index += 1) {
    const tick = index * minorStep;
    (index % 5 === 0 ? major : minor).push(tick);
  }
  return { major, minor };
};

type RowsProps = {
  groups: Group[];
  trackWidth: number;
  ticks: Ticks;
  ruler: Ruler;
  // The labels column's width (0: hidden, in edit mode).
  labelPx: number;
};

// Everything but the playhead, so playing only moves the playhead.
const TimelineRows = memo(function TimelineRows({
  groups,
  trackWidth,
  ticks,
  ruler,
  labelPx,
}: RowsProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const gridLines = (
    <span aria-hidden className='pointer-events-none absolute inset-0'>
      {ticks.major.map((tick) => (
        <span
          key={tick}
          className='absolute inset-y-0 border-l border-slate-700/30'
          style={{ left: ruler.toX(tick) }}
        />
      ))}
    </span>
  );

  return (
    <>
      {/* The ruler: seconds, major and minor ticks. Drag it to scrub. It
          stays on top while the tracks scroll. */}
      <div className='sticky top-0 z-30 flex' style={{ height: AXIS_PX }}>
        {labelPx > 0 && (
          <div
            className='sticky left-0 z-40 shrink-0 border-r border-slate-700/50 bg-slate-950'
            style={{ width: labelPx }}
          />
        )}
        <div
          data-ruler
          className='relative cursor-ew-resize border-b border-slate-700/60 bg-slate-900/80'
          style={{ width: trackWidth }}
        >
          {ticks.minor.map((tick) => (
            <span
              key={tick}
              className='absolute bottom-0 h-1 border-l border-slate-600/60'
              style={{ left: ruler.toX(tick) }}
            />
          ))}
          {ticks.major.map((tick) => (
            <span
              key={tick}
              className='absolute bottom-0 h-2 border-l border-slate-400/80'
              style={{ left: ruler.toX(tick) }}
            >
              <span className='absolute bottom-2 left-1 font-mono text-[9px] leading-none whitespace-nowrap text-slate-400 tabular-nums'>
                {tickLabel(tick)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {groups.map((group) => {
        const open = !collapsed.has(group.id);
        return (
          <div
            key={group.id}
            data-testid={`timeline-group-${group.id}`}
            className='border-t border-slate-700/50'
          >
            <div className='flex h-8'>
              {labelPx > 0 && (
                <button
                  type='button'
                  aria-expanded={open}
                  onClick={() => toggle(group.id)}
                  className='sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-slate-700/50 bg-slate-950 px-2 text-sm font-medium text-slate-100 hover:text-white'
                  style={{ width: labelPx }}
                >
                  <ChevronDown
                    className={cn(
                      'size-4 text-slate-400 transition-transform',
                      !open && '-rotate-90'
                    )}
                  />
                  <group.Icon className='size-4 text-sky-400' aria-hidden />
                  {group.title}
                </button>
              )}
              <div className='relative' style={{ width: trackWidth }}>
                {gridLines}
              </div>
            </div>
            {open &&
              group.rows.map((row) => (
                <div
                  key={row.id}
                  data-testid={`timeline-row-${row.id}`}
                  className='flex h-7 hover:bg-slate-800/30'
                >
                  {labelPx > 0 && (
                    <div
                      className='sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-slate-700/50 bg-slate-950 pr-2 pl-8 text-xs text-slate-300'
                      style={{ width: labelPx }}
                      title={row.label}
                    >
                      {row.icon}
                      <span className='truncate'>{row.label}</span>
                    </div>
                  )}
                  <div className='relative' style={{ width: trackWidth }}>
                    {gridLines}
                    {row.content}
                  </div>
                </div>
              ))}
          </div>
        );
      })}
      {/* The room left under the rows: the grid (and the labels column)
          go on to the bottom. */}
      <div aria-hidden className='flex flex-1 border-t border-slate-700/50'>
        {labelPx > 0 && (
          <div
            className='sticky left-0 z-20 shrink-0 border-r border-slate-700/50 bg-slate-950'
            style={{ width: labelPx }}
          />
        )}
        <div className='relative' style={{ width: trackWidth }}>
          {gridLines}
        </div>
      </div>
    </>
  );
});

// The horizontal scrollbar, under the tracks only (it starts where time
// starts, not under the labels column).
const TimeScrollbar = ({
  scroll,
  onScrollTo,
  labelPx,
}: {
  scroll: { left: number; client: number; width: number };
  onScrollTo: (left: number) => void;
  labelPx: number;
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const visible = scroll.client - labelPx;
  const content = scroll.width - labelPx;
  const maxLeft = Math.max(0, scroll.width - scroll.client);
  const trackWidth = trackRef.current?.clientWidth ?? visible;
  const thumb = Math.max(
    32,
    content > 0 ? (trackWidth * visible) / content : trackWidth
  );
  const room = Math.max(1, trackWidth - thumb);
  const thumbLeft = maxLeft > 0 ? (scroll.left / maxLeft) * room : 0;
  const pxPerScroll = maxLeft / room;

  return (
    <div className='group flex h-2.5 shrink-0 items-center'>
      <div className='shrink-0' style={{ width: labelPx }} />
      <div
        ref={trackRef}
        className='relative h-full flex-1 touch-none'
        // A click on the track jumps there (the thumb centered on it).
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          const x =
            event.clientX - event.currentTarget.getBoundingClientRect().left;
          onScrollTo((x - thumb / 2) * pxPerScroll);
        }}
      >
        {maxLeft > 0 && (
          <span
            role='scrollbar'
            aria-orientation='horizontal'
            aria-controls='timeline-chart'
            aria-valuemin={0}
            aria-valuemax={Math.round(maxLeft)}
            aria-valuenow={Math.round(scroll.left)}
            className='absolute top-1/2 h-1 -translate-y-1/2 cursor-pointer rounded-full bg-slate-600/70 transition-[height,background-color] group-hover:h-1.5 group-hover:bg-slate-500/90'
            style={{ left: thumbLeft, width: thumb }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, left: scroll.left };
            }}
            onPointerMove={(event) => {
              if (drag.current) {
                onScrollTo(
                  drag.current.left +
                    (event.clientX - drag.current.x) * pxPerScroll
                );
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
        )}
      </div>
    </div>
  );
};

// How long the pointer rests on a block before its tip opens, and how
// long a tip stays once the pointer leaves (to reach it and scroll it).
const TIP_OPEN_MS = 150;
const TIP_CLOSE_MS = 120;

// The block's box, and the pointer's x: the tip opens over the block
// where the pointer is (a long bar's middle can be far from it).
type Hover = { key: string; rect: DOMRect; x: number };

// The timeline's one tooltip: a card over the block hovered (under it
// when there is no room above), kept on screen; hovering it keeps it
// open.
const HoverTip = ({
  hover,
  content,
  onEnter,
  onLeave,
}: {
  hover: Hover | null;
  content: ReactNode;
  onEnter: () => void;
  onLeave: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null
  );
  useLayoutEffect(() => {
    const element = ref.current;
    if (!hover || !element) {
      setPlace(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const { rect } = hover;
    const left = Math.min(
      window.innerWidth - width - 8,
      Math.max(8, hover.x - width / 2)
    );
    const above = rect.top - height - 8;
    const top =
      above >= 8
        ? above
        : Math.min(window.innerHeight - height - 8, rect.bottom + 8);
    setPlace({ left, top });
  }, [hover]);
  if (!hover || !content) {
    return null;
  }
  return createPortal(
    <div
      ref={ref}
      role='tooltip'
      data-testid='timeline-tooltip'
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={cn(
        'fixed z-50 rounded-md border border-slate-700 bg-slate-900/95 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur transition-opacity duration-100',
        place ? 'opacity-100' : 'opacity-0'
      )}
      style={place ?? { left: -9999, top: -9999 }}
    >
      {content}
    </div>,
    document.body
  );
};

type Gesture = {
  mode: 'scrub' | 'pan';
  startX: number;
  startScroll: number;
  moved: boolean;
};

// The center chart, as a video editor's timeline: wider than the screen,
// it scrolls. The wheel scrolls (Shift: pans), Ctrl/Alt + wheel zooms at the pointer,
// dragging the tracks pans (a click moves the playhead), dragging the
// ruler scrubs; Space plays, ← → step a frame (Shift: a second).
const TimelineChart = ({
  view,
  actions,
  members,
  actionsById,
  time,
  ruler,
  pxPerSecond,
  onSeek,
  onTogglePlay,
  onZoom,
  onTrackWidthChange,
  selectedBlock = null,
  onSelectBlock,
  onDropBlock,
  axisSeconds,
}: TimelineChartProps) => {
  const editing = onSelectBlock !== undefined;
  // The labels column on the left (in edit mode too).
  const labelPx = LABEL_PX;
  // Edit mode: the slot a drag would drop in (its moment) and what is
  // dragged: the guide line and the placeholder go there.
  const [slot, setSlot] = useState<DropSlot | null>(null);
  const trackWidth = ruler.totalWidth;
  const ticks = useMemo(
    () => buildTicks(axisSeconds ?? view.duration, pxPerSecond),
    [axisSeconds, view.duration, pxPerSecond]
  );
  const { groups, tips } = useMemo(
    () =>
      buildGroups(
        view,
        actions,
        members,
        actionsById,
        ruler,
        selectedBlock,
        editing,
        slot
      ),
    [view, actions, members, actionsById, ruler, selectedBlock, editing, slot]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) =>
      onTrackWidthChange(entry.contentRect.width - labelPx)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onTrackWidthChange, labelPx]);

  // Where a point of the tracks is on screen, from the tracks' left edge.
  const viewX = (clientX: number) =>
    clientX - (scrollRef.current?.getBoundingClientRect().left ?? 0) - labelPx;
  const timeAtClient = (clientX: number) =>
    ruler.toTime(viewX(clientX) + (scrollRef.current?.scrollLeft ?? 0));

  // A zoom keeps one moment where it was on screen: the one under the
  // pointer (wheel), else the playhead. Any other new ruler (a new run, a
  // block added or removed in edit mode) leaves the view where it is.
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  const previousRuler = useRef(ruler);
  const previousScale = useRef(pxPerSecond);
  const timeRef = useRef(time);
  timeRef.current = time;
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previous = previousRuler.current;
    const zoomed = previousScale.current !== pxPerSecond;
    previousRuler.current = ruler;
    previousScale.current = pxPerSecond;
    if (!element || previous === ruler || !zoomed) {
      anchor.current = null;
      return;
    }
    const kept = anchor.current ?? {
      time: timeRef.current,
      offset: previous.toX(timeRef.current) - element.scrollLeft,
    };
    anchor.current = null;
    element.scrollLeft = Math.max(0, ruler.toX(kept.time) - kept.offset);
  }, [ruler, pxPerSecond]);

  // While the playhead moves, the view follows it smoothly: once it nears
  // an edge, the view moves with it, so it stays there (no page jumps). A
  // far jump (a step, a log row) scrolls there animated. Dragging (the
  // tracks or the playhead) leaves the view to the gesture.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || gesture.current) {
      return;
    }
    const x = ruler.toX(time);
    const visible = element.clientWidth - labelPx;
    const margin = Math.min(FOLLOW_MARGIN_PX, visible * 0.2);
    const left = element.scrollLeft;
    const target =
      x > left + visible - margin
        ? x - (visible - margin)
        : x < left + margin
        ? x - margin
        : left;
    const clamped = Math.min(
      element.scrollWidth - element.clientWidth,
      Math.max(0, target)
    );
    if (Math.abs(clamped - left) < 0.5) {
      return;
    }
    if (Math.abs(clamped - left) > visible / 2) {
      element.scrollTo({ left: clamped, behavior: 'smooth' });
    } else {
      element.scrollLeft = clamped;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  // The wheel: scrolls (Shift: pans), or zooms with Ctrl/Alt/⌘ (a pinch
  // is Ctrl + wheel).
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  const rulerRef = useRef(ruler);
  rulerRef.current = ruler;
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        event.preventDefault();
        const offset =
          event.clientX - element.getBoundingClientRect().left - labelPx;
        anchor.current = {
          time: rulerRef.current.toTime(element.scrollLeft + offset),
          offset,
        };
        zoomRef.current(Math.exp(-event.deltaY * WHEEL_ZOOM * 2));
        return;
      }
      // A sideways swipe pans (the native horizontal scroll is off, see
      // TimeScrollbar); up and down scroll the tracks when they do not
      // fit, else (or with Shift) pan.
      const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const scrollsDown = element.scrollHeight > element.clientHeight + 1;
      if (!sideways && scrollsDown && !event.shiftKey) {
        return;
      }
      event.preventDefault();
      element.scrollLeft += sideways ? event.deltaX : event.deltaY;
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [labelPx]);

  // Where the view is: the time scrollbar and the playhead's label follow
  // it.
  const [scroll, setScroll] = useState({ left: 0, client: 0, width: 0 });
  const measure = () => {
    const element = scrollRef.current;
    if (element) {
      setScroll({
        left: element.scrollLeft,
        client: element.clientWidth,
        width: element.scrollWidth,
      });
    }
  };
  useLayoutEffect(measure, [ruler]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const gesture = useRef<Gesture | null>(null);
  const [panning, setPanning] = useState(false);

  // The one tooltip: which block's tip is open, found by delegation.
  const [hover, setHover] = useState<Hover | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  hoverRef.current = hover;
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const keepTip = () => window.clearTimeout(closeTimer.current);
  const hideTipSoon = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(null), TIP_CLOSE_MS);
  };
  const hideTip = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setHover(null);
  };
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    []
  );
  const tipTarget = (target: EventTarget | null) =>
    target instanceof Element
      ? (target.closest('[data-tip]') as HTMLElement | null)
      : null;
  const handleTipOver = (event: React.PointerEvent) => {
    const element = tipTarget(event.target);
    // No tips while a block is dragged (edit mode): they would cover it.
    if (!element || gesture.current || dragging.current) {
      return;
    }
    keepTip();
    tipPointerX.current = event.clientX;
    const next = {
      key: element.dataset.tip ?? '',
      rect: element.getBoundingClientRect(),
      x: event.clientX,
    };
    if (hoverRef.current?.key === next.key) {
      return;
    }
    window.clearTimeout(openTimer.current);
    // A tip already open moves at once; a first one waits a moment.
    if (hoverRef.current) {
      setHover(next);
    } else {
      // Where the pointer is when it opens (it may have moved meanwhile).
      openTimer.current = window.setTimeout(
        () => setHover({ ...next, x: tipPointerX.current }),
        TIP_OPEN_MS
      );
    }
  };
  // Along a long bar, the open tip follows the pointer (once a frame).
  const tipPointerX = useRef(0);
  const tipFrame = useRef(0);
  const handleTipMove = (event: React.PointerEvent) => {
    tipPointerX.current = event.clientX;
    const open = hoverRef.current;
    if (!open || tipFrame.current) {
      return;
    }
    if (tipTarget(event.target)?.dataset.tip !== open.key) {
      return;
    }
    tipFrame.current = requestAnimationFrame(() => {
      tipFrame.current = 0;
      setHover((current) =>
        current ? { ...current, x: tipPointerX.current } : current
      );
    });
  };
  useEffect(() => () => cancelAnimationFrame(tipFrame.current), []);
  const handleTipOut = (event: React.PointerEvent) => {
    const from = tipTarget(event.target);
    if (from && tipTarget(event.relatedTarget) !== from) {
      hideTipSoon();
    }
  };
  // Dragging the playhead to an edge (or past it) keeps the view moving
  // that way, faster the further in, with the playhead under the pointer.
  const pointerX = useRef(0);
  const edgeFrame = useRef(0);
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  const panAtEdges = () => {
    const element = scrollRef.current;
    if (!element || gesture.current?.mode !== 'scrub') {
      return;
    }
    const x = viewX(pointerX.current);
    const visible = element.clientWidth - labelPx;
    const into =
      x > visible - EDGE_PX
        ? (x - (visible - EDGE_PX)) / EDGE_PX
        : x < EDGE_PX
        ? -(EDGE_PX - x) / EDGE_PX
        : 0;
    if (into !== 0) {
      element.scrollLeft +=
        Math.sign(into) * Math.min(1, Math.abs(into)) ** 2 * EDGE_SPEED_PX;
      seekRef.current(timeAtClient(pointerX.current));
    }
    edgeFrame.current = requestAnimationFrame(panAtEdges);
  };
  useEffect(() => () => cancelAnimationFrame(edgeFrame.current), []);

  const endGesture = (clientX: number) => {
    const current = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(edgeFrame.current);
    setPanning(false);
    // A click on the tracks (no drag) moves the playhead there.
    if (current?.mode === 'pan' && !current.moved) {
      onSeek(timeAtClient(clientX));
    }
  };

  // Edit mode (dnd-kit): the tracks take drops; while a drag is over them,
  // the guide line shows where it would go, and the drop goes before the
  // block under it (past the last one: at the end).
  const { setNodeRef: setTracksRef } = useDroppable({
    id: TRACKS_DROP_ID,
    disabled: !onDropBlock,
  });
  // The labels column (on the left) is not part of the axis.
  const dropTimeOf = () => {
    const x = currentPointerX();
    return x === null || viewX(x) < 0 ? null : timeAtClient(x);
  };
  // The action a drag carries: a palette one, or a block's.
  const draggedActionId = (payload: DragPayload | null) =>
    payload?.kind === 'new'
      ? payload.actionId
      : payload
      ? actions.find((group) => group.blockUid === payload.blockUid)
          ?.actionId ?? null
      : null;
  const dragging = useRef(false);
  useDndMonitor({
    onDragStart: () => {
      dragging.current = true;
      hideTip();
    },
    onDragMove: (event) => {
      const at = event.over?.id === TRACKS_DROP_ID ? dropTimeOf() : null;
      const actionId = draggedActionId(payloadOf(event));
      const next =
        at === null || !actionId
          ? null
          : { time: dropSlot(actions, at).time, actionId };
      // Only when the slot changes: the rows redraw with it.
      setSlot((current) =>
        current?.time === next?.time && current?.actionId === next?.actionId
          ? current
          : next
      );
    },
    onDragCancel: () => {
      dragging.current = false;
      setSlot(null);
    },
    onDragEnd: (event) => {
      dragging.current = false;
      setSlot(null);
      const payload = payloadOf(event);
      const time = dropTimeOf();
      if (
        onDropBlock &&
        payload &&
        time !== null &&
        event.over?.id === TRACKS_DROP_ID
      ) {
        onDropBlock(payload, dropBefore(actions, time));
      }
    },
  });

  // The playhead's label: centered on the line, but never under the
  // labels column (at the start it sits at the tracks' left edge).
  const headX = ruler.toX(time);
  const headAtStart = headX - scroll.left < HEAD_HALF_PX;

  return (
    <>
      <div className='flex h-full min-h-0 flex-col bg-slate-950'>
        <div
          ref={scrollRef}
          id='timeline-chart'
          data-testid='timeline-chart'
          tabIndex={0}
          aria-label='Timeline'
          onScroll={() => {
            measure();
            hideTip();
          }}
          className='relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-950 pb-1 outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60'
          onKeyDown={(event) => {
            if (event.key === ' ') {
              event.preventDefault();
              onTogglePlay();
            } else if (
              event.key === 'ArrowRight' ||
              event.key === 'ArrowLeft'
            ) {
              event.preventDefault();
              const step = event.shiftKey ? 1 : 1 / FRAMES_PER_SECOND;
              onSeek(time + (event.key === 'ArrowRight' ? step : -step));
            } else if (event.key === 'Home') {
              event.preventDefault();
              onSeek(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              onSeek(view.duration);
            } else if (event.key === '+' || event.key === '=') {
              onZoom(1.25);
            } else if (event.key === '-') {
              onZoom(0.8);
            }
          }}
        >
          <div
            ref={setTracksRef}
            // At least the panel's height: with few rows (one character, few
            // buffs) the tracks still reach the bottom.
            className={cn(
              'relative flex min-h-full touch-none flex-col select-none [&_img]:pointer-events-none',
              panning ? 'cursor-grabbing' : 'cursor-grab'
            )}
            style={{ width: labelPx + trackWidth + 16 }}
            onDragStart={(event) => event.preventDefault()}
            // Edit mode: a click on a block picks it.
            onClick={(event) => {
              const blockUid = (
                event.target as HTMLElement
              ).closest<HTMLElement>('[data-block-uid]')?.dataset.blockUid;
              if (editing && blockUid) {
                onSelectBlock?.(blockUid);
              }
            }}
            onPointerOver={handleTipOver}
            onPointerOut={handleTipOut}
            onPointerDown={(event) => {
              hideTip();
              // The labels (sticky on the left) are not part of the axis;
              // in edit mode, a block is dragged, not the tracks.
              if (
                viewX(event.clientX) < 0 ||
                event.button === 2 ||
                (editing &&
                  (event.target as HTMLElement).closest('[data-block-uid]'))
              ) {
                return;
              }
              const onRuler =
                event.button === 0 &&
                (event.target as HTMLElement).closest('[data-ruler]') !== null;
              gesture.current = {
                mode: onRuler ? 'scrub' : 'pan',
                startX: event.clientX,
                startScroll: scrollRef.current?.scrollLeft ?? 0,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              if (onRuler) {
                pointerX.current = event.clientX;
                onSeek(timeAtClient(event.clientX));
                cancelAnimationFrame(edgeFrame.current);
                edgeFrame.current = requestAnimationFrame(panAtEdges);
              }
            }}
            onPointerMove={(event) => {
              handleTipMove(event);
              const current = gesture.current;
              const element = scrollRef.current;
              if (!current || !element) {
                return;
              }
              if (current.mode === 'scrub') {
                pointerX.current = event.clientX;
                onSeek(timeAtClient(event.clientX));
                return;
              }
              const delta = event.clientX - current.startX;
              if (!current.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) {
                return;
              }
              if (!current.moved) {
                current.moved = true;
                setPanning(true);
              }
              element.scrollLeft = current.startScroll - delta;
            }}
            onPointerUp={(event) => endGesture(event.clientX)}
            onPointerCancel={() => {
              gesture.current = null;
              cancelAnimationFrame(edgeFrame.current);
              setPanning(false);
            }}
          >
            {/* The playhead's head, on the ruler (it stays there while the
              tracks scroll), under the labels' corner. */}
            {headX >= scroll.left && (
              <div className='pointer-events-none sticky top-0 z-[35] h-0'>
                <span
                  className={cn(
                    'absolute top-0 rounded-sm bg-sky-500 px-1 py-px font-mono text-[9px] leading-none whitespace-nowrap text-white shadow',
                    !headAtStart && '-translate-x-1/2'
                  )}
                  style={{
                    left: labelPx + (headAtStart ? scroll.left : headX),
                  }}
                >
                  {playheadLabel(time)}
                </span>
                <span
                  className='absolute top-[11px] size-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent border-t-sky-500'
                  style={{ left: labelPx + headX }}
                />
              </div>
            )}
            <TimelineRows
              groups={groups}
              trackWidth={trackWidth}
              ticks={ticks}
              ruler={ruler}
              labelPx={labelPx}
            />
            {/* Edit mode: where the block being dragged would go. */}
            {slot !== null && (
              <span
                aria-hidden
                data-testid='timeline-drop-guide'
                className='pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-sky-400 shadow-[0_0_6px_rgb(56_189_248/0.8)]'
                style={{ left: labelPx + ruler.toX(slot.time) }}
              />
            )}

            {/* The playhead's line through every track. */}
            <span
              aria-hidden
              data-testid='timeline-cursor'
              className='pointer-events-none absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-sky-400 shadow-[0_0_6px_var(--color-sky-400)]'
              style={{ left: labelPx + ruler.toX(time) }}
            />
          </div>
        </div>
        <TimeScrollbar
          labelPx={labelPx}
          scroll={scroll}
          onScrollTo={(left) => {
            if (scrollRef.current) {
              scrollRef.current.scrollLeft = left;
            }
          }}
        />
      </div>
      <HoverTip
        hover={hover}
        content={hover ? tips.get(hover.key) ?? null : null}
        onEnter={keepTip}
        onLeave={hideTipSoon}
      />
    </>
  );
};

export default TimelineChart;
