import { useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronDown,
  HeartPulse,
  LucideIcon,
  Plus,
  ShieldPlus,
  Sparkle,
  Swords,
  Target,
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
import {
  currentPointerX,
  memberRowAtPointer,
  payloadOf,
  TRACKS_DROP_ID,
} from './rotationDnd';
import { Ruler } from './ruler';
import SectionHelp from './SectionHelp';
import { SectionHelpKey } from './sectionHelp';
import { SOURCE_STYLES, SourceKind, sourceKindOfChip } from './sourceStyles';
import {
  ActionGroup,
  actionTitle,
  closingHits,
  describeTrigger,
  displayAction,
  DragPayload,
  dropBefore,
  dropSlot,
  formSegments,
  hitsOfGroup,
  isReactionHit,
  mergeSpans,
  meterAt,
  particleArrivals,
  resourcesAtAction,
  systemEventRows,
} from './timelineData';
import { HeaderMember } from './TimelineHeader';
import { TipCard, TipStat, TipText, TipTime } from './TimelineTooltip';
import RotationActionIcon from '../rotation/RotationActionIcon';
import { describeActionCost, getActionCost } from '../../_lib/actionCosts';
import { getLoadedCharacter } from '../../_lib/characterData';
import {
  isFieldAction,
  splitTeamActionId,
} from '../../_lib/engine/simulateTeam';
import formatNumber from '../../_lib/formatNumber';
import { FRAMES_PER_SECOND } from '../../_lib/frames';
import { elementIconUrl } from '../../_lib/genshinIcons';
import {
  ActionPiece,
  BlockType,
  coordinatedUntil,
  InspectorView,
} from '../../_lib/inspector';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { TeamMemberRun } from '../../_lib/team';

export const LABEL_PX = 200;
const AXIS_PX = 20;
const ICON_PX = 20;
// Room an icon needs around it in a block (or a stretch of one) to show.
const ICON_ROOM_PX = 4;
// A skipped block's marker (it takes no time).
const SKIPPED_PX = 26;
// Edit mode: the ghost of a dragged block where it will land.
const PLACEHOLDER_PX = 36;

// Where a dragged block would go, and the member's row it is over (a Dash
// or Wait goes on theirs).
// `blockUids`: a dragged multi-selection (a ghost per block, in order).
type DropSlot = {
  time: number;
  actionId: string;
  rowMember: string | null;
  blockUids?: string[];
};
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
  // Edit mode (when `onSelectBlock` is set): the blocks picked, picking
  // one (a click; Ctrl/Cmd: adds or removes it; Shift: the range from the
  // last one picked), picking those a Shift + drag rectangle touches, the
  // selection keys (Esc, Delete, Ctrl/Cmd + A, C, X, V), and a drop on the tracks:
  // before that block (null: at the end).
  selectedBlocks?: string[];
  onSelectBlock?: (
    blockUid: string,
    modifiers: { range: boolean; toggle: boolean }
  ) => void;
  onSelectBlocks?: (blockUids: string[], additive: boolean) => void;
  // `beforeUid` (paste): where the pointer is over the tracks, the block
  // a paste goes before (null: at the end); undefined: not over them.
  onSelectionKey?: (
    key: 'clear' | 'delete' | 'all' | 'copy' | 'cut' | 'paste',
    beforeUid?: string | null
  ) => void;
  onDropBlock?: (
    payload: DragPayload,
    beforeUid: string | null,
    rowMember: string | null
  ) => void;
  // The buff or debuff bar under the pointer (its block's key), or null.
  onHoverChip?: (chipKey: string | null) => void;
  // Each member's run: what it had when an action started (its tooltip).
  memberRuns?: TeamMemberRun[];
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

type Bar = {
  key: string;
  start: number;
  end: number;
  title: ReactNode;
  // The block it shows (the Event panel lights it on hover).
  chipKey?: string;
};
type Mark = { key: string; time: number; title: ReactNode };

type Row = {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

type Group = {
  id: string;
  title: string;
  // Its "?" tooltip.
  help: SectionHelpKey;
  Icon: LucideIcon;
  rows: Row[];
};

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
// Each tooltip, by key. An action's is made when it is hovered (a thunk):
// it reads the character's state then, too slow to do for every block on
// every render.
type Tips = Map<string, ReactNode | (() => ReactNode)>;

const tipOf = (tip: ReactNode | (() => ReactNode) | undefined): ReactNode =>
  typeof tip === 'function' ? tip() : tip ?? null;

const KIND_LABELS: Record<string, string> = {
  normal: 'Normal Attack',
  charged: 'Charged Attack',
  plunge: 'Plunge',
  skill: 'Elemental Skill',
  burst: 'Elemental Burst',
  move: 'Move',
  dodge: 'Dodge',
  wait: 'Wait',
  swap: 'Swap',
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
        data-chip={bar.chipKey}
        className={cn(
          'absolute top-1/2 h-3 -translate-y-1/2 rounded-full',
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

type ActionBlockProps = {
  dragId: string;
  blockUid: string;
  editing: boolean;
  tipKey: string;
  selected: boolean;
  className: string;
  style: CSSProperties;
  children: ReactNode;
};

// An action on the chart. In edit mode it drags (dnd-kit): to move its
// block, or onto the trash; the chart stays in place under it. Out of it,
// a plain block: it does not follow the drag context, which changes on
// every frame of a playback.
const DraggableAction = (props: ActionBlockProps) =>
  props.editing ? <EditableAction {...props} /> : <ShownAction {...props} />;

const ShownAction = ({
  blockUid,
  tipKey,
  selected,
  className,
  style,
  children,
}: ActionBlockProps) => (
  <span
    data-tip={tipKey}
    data-testid='timeline-action'
    data-block-uid={blockUid}
    data-selected={selected || undefined}
    className={className}
    style={style}
  >
    {children}
  </span>
);

const EditableAction = ({
  dragId,
  blockUid,
  tipKey,
  selected,
  className,
  style,
  children,
}: ActionBlockProps) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `block:${dragId}`,
    data: { kind: 'move', blockUid } satisfies DragPayload,
  });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-tip={tipKey}
      data-testid='timeline-action'
      data-block-uid={blockUid}
      data-selected={selected || undefined}
      // A click picks the block without focusing it: the browser would
      // scroll the tracks to show the focused block.
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        className,
        'cursor-grab touch-none active:cursor-grabbing',
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
// The particle lines, by element (clear ones: white).
const PARTICLE_LINES: Record<string, string> = {
  Pyro: 'border-orange-400/50',
  Hydro: 'border-sky-400/50',
  Electro: 'border-violet-400/50',
  Cryo: 'border-cyan-300/50',
  Anemo: 'border-teal-300/50',
  Geo: 'border-amber-300/50',
  Dendro: 'border-lime-400/50',
  clear: 'border-slate-200/40',
};

// No runs given: one stable empty list (it is a memo dependency).
const NO_MEMBER_RUNS: TeamMemberRun[] = [];
const NO_BLOCKS: string[] = [];

const buildGroups = (
  view: InspectorView,
  chartActions: ActionGroup[],
  members: TimelineMember[],
  actionsById: Map<string, RotationAction>,
  ruler: Ruler,
  selected: Set<string>,
  editing: boolean,
  slot: DropSlot | null,
  memberRuns: TeamMemberRun[]
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
    actionTitle(action, displayAction(action, actionsById));
  const actionIcon = (action: ActionPiece, size = 30) => {
    const rotationAction = displayAction(action, actionsById);
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
    const kind = displayAction(action, actionsById)?.kind;
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
        {/* What the character had when it started (Energy, Nightsoul
            points…), then what it costs. */}
        {(() => {
          const member = memberRuns.find(
            (entry) => entry.characterId === action.characterId
          );
          return member
            ? resourcesAtAction(member, action).map((row) => (
                <TipStat
                  key={row.label}
                  label={row.label}
                  value={`${
                    row.value === null ? '—' : formatNumber(row.value)
                  }${row.max === null ? '' : ` / ${formatNumber(row.max)}`}${
                    row.format === 'percent' ? '%' : ''
                  }`}
                  className='text-sky-200'
                />
              ))
            : null;
        })()}
        {/* What it costs (and its cheaper forms, and what it needs). */}
        {describeActionCost(
          getActionCost(action.characterId, action.actionId)
        ).map((line) => (
          <TipStat key={line} label='Cost' value={line} />
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
        const rotationAction = displayAction(action, actionsById);
        tips.set(`a:${action.key}`, () => actionTip(action));
        const skipped = action.parts.every((part) => part.skipped);
        // A block starts where it was put: its wait for a cooldown first
        // (dead time, grey), then the action. A skipped one takes no time:
        // a marker on top (the next block starts there too).
        const from = ruler.toStartX(action.start - action.waited);
        const left = skipped ? ruler.toX(action.start) - SKIPPED_PX / 2 : from;
        const width = skipped ? SKIPPED_PX : ruler.toX(action.end) - from;
        const waitWidth = skipped ? 0 : ruler.toStartX(action.start) - from;
        const warned = warningsOf(action).length > 0;
        // Its runs of one form (a combo that left the roller skates
        // mid-way): each drawn as its own stretch inside the block.
        const segments = formSegments(action.parts);
        return (
          <DraggableAction
            key={action.key}
            dragId={action.key}
            blockUid={action.blockUid}
            editing={editing}
            tipKey={`a:${action.key}`}
            selected={selected.has(action.blockUid)}
            className={cn(
              'absolute top-1/2 flex h-6 -translate-y-1/2 items-center justify-center overflow-hidden rounded-md border shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-colors hover:brightness-125',
              // The member's own color, in its shade for the action's kind.
              (rotationAction && member.color.kinds[rotationAction.kind]) ??
                member.color.chip,
              // Not performed (on cooldown…): kept in its place, on top.
              skipped &&
                'z-10 rounded-full border-dashed border-amber-400 bg-slate-900',
              selected.has(action.blockUid) &&
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
            {/* The action's own part (after its wait): one stretch per
                form it played in a row (Blade Roller kicks, then plain
                Normal Attacks once the Blessing ends), within the block. */}
            {segments.length > 1 ? (
              segments.map((segment, index) => {
                const segmentLeft =
                  index === 0 ? waitWidth : ruler.toX(segment.start) - from;
                const next = segments[index + 1];
                const segmentRight = next
                  ? ruler.toX(next.start) - from
                  : width;
                const segmentAction = displayAction(
                  {
                    shownActionId: action.shownActionId,
                    performedActionId: segment.performed,
                  },
                  actionsById
                );
                return (
                  <span
                    key={`${segment.performed}@${segment.start}`}
                    data-testid='timeline-action-segment'
                    title={
                      segment.past
                        ? `${segment.hits} ${
                            segment.hits === 1 ? 'hit' : 'hits'
                          } after its state ended (the game cuts the spin there)`
                        : `${segment.hits} × ${
                            segmentAction?.label.replace(/^[^:]+:\s*/, '') ?? ''
                          }`
                    }
                    className={cn(
                      'absolute inset-y-0 flex items-center justify-center',
                      index > 0 && 'border-l-2 border-slate-950/70',
                      // Its own animation going on past its state: the same
                      // action, faded and striped.
                      segment.past &&
                        'bg-[repeating-linear-gradient(135deg,rgb(2_6_23/0.35)_0_4px,transparent_4px_8px)] opacity-60'
                    )}
                    style={{
                      left: segmentLeft,
                      width: Math.max(0, segmentRight - segmentLeft),
                    }}
                  >
                    {/* Only where it fits: a stretch too short shows none. */}
                    {segmentAction &&
                      segmentRight - segmentLeft >= ICON_PX + ICON_ROOM_PX && (
                        <RotationActionIcon
                          action={segmentAction}
                          size={ICON_PX}
                          className='bg-transparent p-0 ring-0 drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]'
                        />
                      )}
                  </span>
                );
              })
            ) : (
              <span
                className='relative flex h-full flex-1 items-center justify-center'
                style={waitWidth > 0 ? { marginLeft: waitWidth } : undefined}
              >
                {width - waitWidth <
                ICON_PX + ICON_ROOM_PX ? null : rotationAction ? (
                  <RotationActionIcon
                    action={rotationAction}
                    size={ICON_PX}
                    className='bg-transparent p-0 ring-0 drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]'
                  />
                ) : (
                  <span className='size-2 rounded-full bg-current opacity-60' />
                )}
              </span>
            )}
            {/* The frame its closing hit lands (the Final of a spin): a
                gold bar, apart from the dark ones between stretches. */}
            {closingHits(view.hits, action.blockUid, action.characterId)
              .filter((hit) => hit.time > action.start && hit.time < action.end)
              .map((hit) => (
                <span
                  key={hit.index}
                  data-testid='timeline-action-closing-hit'
                  aria-label={`${hit.label} at ${hit.time.toFixed(2)} s`}
                  className='pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-amber-300 shadow-[0_0_3px_rgb(252_211_77/0.8)]'
                  style={{ left: ruler.toX(hit.time) - from }}
                />
              ))}
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
  // Edit mode: where several picked blocks will land, one ghost per block
  // in its member's row, back to back from the slot, each as long as it
  // took (its wait included).
  if (slot?.blockUids) {
    const picked = new Set(slot.blockUids);
    let at = slot.time;
    [...chartActions]
      .filter((action) => picked.has(action.blockUid))
      .sort((first, second) => first.start - second.start)
      .forEach((action) => {
        const owner = splitTeamActionId(action.actionId).characterId;
        const ghost = actionsById.get(action.actionId);
        const row = actionRows.find((entry) => entry.id === `action-${owner}`);
        const length = Math.max(0, action.end - (action.start - action.waited));
        const left = ruler.toX(at);
        const width = Math.max(PLACEHOLDER_PX, ruler.toX(at + length) - left);
        at += length;
        if (!row || !ghost) {
          return;
        }
        row.content = (
          <>
            {row.content}
            <span
              aria-hidden
              data-testid='timeline-drop-placeholder'
              className='pointer-events-none absolute top-1/2 z-20 flex h-6 -translate-y-1/2 items-center justify-center rounded-md border-2 border-dashed border-sky-400 bg-sky-500/25 shadow-[0_0_8px_rgb(56_189_248/0.6)]'
              style={{ left, width }}
            >
              <RotationActionIcon
                action={ghost}
                size={ICON_PX}
                className='bg-transparent p-0 ring-0 opacity-80'
              />
            </span>
          </>
        );
      });
  } else if (slot) {
    // Edit mode: where the block being dragged will land, as a ghost of it
    // in its member's row (between the blocks it goes between).
    // A Dash or Wait goes where it is dropped: the row it is over.
    const owner =
      slot.rowMember && isFieldAction(slot.actionId)
        ? slot.rowMember
        : splitTeamActionId(slot.actionId).characterId;
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
    // Renewed while up, it is one stretch (mergeSpans).
    const parts = mergeSpans(
      chip.renewals && chip.renewals.length > 0
        ? chip.renewals.map((renewal) => ({
            start: renewal.start,
            end: renewal.end ?? renewal.until ?? view.duration,
          }))
        : [{ start: chip.start, end: chip.end ?? view.duration }]
    );
    parts.forEach((part, index) =>
      row.bars.push({
        key: `${chip.key}-${index}`,
        chipKey: chip.key,
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
            {part.count > 1 && (
              <TipStat label='Applications' value={String(part.count)} />
            )}
            {parts.length > 1 && (
              <TipStat
                label='Stretch'
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
        colorClass={SOURCE_STYLES[row.kind].track}
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

  // Coordinated attacks: hits made by a block, not by an action's own row
  // (Escoffier's Mek, Nicole's Arcane Projections), one row per source:
  // its time up (a status's span) behind a dot per hit.
  const coordinatedRows: Row[] = coordinatedUntil(
    view,
    Number.POSITIVE_INFINITY
  ).map((source) => {
    const key = `${source.characterId}|${source.sourceId}`;
    const chip = view.chips.find(
      (entry) =>
        entry.characterId === source.characterId &&
        entry.blockId === source.sourceId
    );
    const marks: Mark[] = view.hits
      .filter(
        (hit) =>
          hit.coordinated &&
          hit.characterId === source.characterId &&
          hit.sourceId === source.sourceId
      )
      .map((hit) => ({
        key: `${hit.characterId}-${hit.index}`,
        time: hit.time,
        title: (
          <TipCard
            icon={<ElementIcon element={hit.element} size={26} />}
            title={source.label}
            owner={ownerOf(hit.characterId)}
            badge='Coordinated'
            value={`${formatNumber(hit.damage)} DMG`}
            accentClass={accentOf(hit.characterId)}
          >
            <TipTime start={hit.time} />
            <TipStat
              label='Element'
              value={<ElementList elements={[hit.element]} />}
            />
            <TipStat
              label='CRIT'
              value={hit.isCrit ? 'Yes' : 'No'}
              className={hit.isCrit ? 'text-rose-300' : undefined}
            />
            {!hit.counted && (
              <TipStat label='Counted' value='No (past the counted time)' />
            )}
          </TipCard>
        ),
      }));
    marks.forEach((mark) => tips.set(`k:${mark.key}`, mark.title));
    const spans =
      chip && chip.kind === 'status'
        ? mergeSpans(
            view.chips
              .filter(
                (entry) =>
                  entry.characterId === source.characterId &&
                  entry.blockId === source.sourceId
              )
              .flatMap((entry) =>
                entry.renewals && entry.renewals.length > 0
                  ? entry.renewals.map((renewal) => ({
                      start: renewal.start,
                      end: renewal.end ?? renewal.until ?? view.duration,
                    }))
                  : [{ start: entry.start, end: entry.end ?? view.duration }]
              )
          ).map((span, index) => ({
            key: `${key}-${index}`,
            start: span.start,
            end: span.end,
            title: null,
          }))
        : [];
    return {
      id: `coordinated-${source.characterId}-${source.sourceId}`,
      label: source.label,
      icon: chip?.iconUrl ? (
        <RowIcon src={chip.iconUrl} />
      ) : (
        <Target className='size-[18px] text-sky-300' aria-hidden />
      ),
      content: (
        <>
          <Bars
            bars={spans}
            ruler={ruler}
            colorClass='border border-sky-400/40 bg-sky-500/10'
          />
          <Marks marks={marks} prefix='k:' ruler={ruler}>
            <MarkDot
              className='bg-sky-500/30 text-sky-100 ring-sky-400/60'
              Icon={Target}
            />
          </Marks>
        </>
      ),
    };
  });

  const groups: Group[] = [
    {
      id: 'actions',
      help: 'characterActions' as const,
      title: 'Character Actions',
      Icon: Swords,
      rows: actionRows,
    },
    {
      id: 'buffs',
      help: 'buffs' as const,
      title: 'Buffs & Debuffs',
      Icon: ShieldPlus,
      rows: [...buffRows, ...systemRows],
    },
    {
      id: 'coordinated',
      help: 'coordinated' as const,
      title: 'Coordinated Attacks',
      Icon: Target,
      rows: coordinatedRows,
    },
    {
      id: 'energy',
      help: 'energy' as const,
      title: 'Energy & Particles',
      Icon: Zap,
      rows: energyRows,
    },
    {
      id: 'other',
      help: 'other' as const,
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
            <div className='flex h-10'>
              {labelPx > 0 && (
                <button
                  type='button'
                  aria-expanded={open}
                  onClick={() => toggle(group.id)}
                  className='sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-slate-700/50 bg-slate-950 px-2 text-xs font-medium text-slate-100 hover:text-white'
                  style={{ width: labelPx }}
                >
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-slate-400 transition-transform',
                      !open && '-rotate-90'
                    )}
                  />
                  <group.Icon
                    className='size-3.5 shrink-0 text-sky-400'
                    aria-hidden
                  />
                  <span className='truncate'>{group.title}</span>
                  {/* At the column's right edge, the same for every group. */}
                  <SectionHelp section={group.help} className='ml-auto' />
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
                  // A member's actions row: what a Dash or Wait dropped on
                  // it belongs to.
                  data-row-member={
                    row.id.startsWith('action-') ? row.id.slice(7) : undefined
                  }
                  className='flex h-8 hover:bg-slate-800/30'
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
            {/* Room after a section's rows, so sections stand apart. */}
            {open && group.rows.length > 0 && (
              <div aria-hidden className='flex h-3'>
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
            )}
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
  // 'marquee': Shift + drag on empty tracks in edit mode, a selection
  // rectangle (from startX / startY, client coordinates).
  mode: 'scrub' | 'pan' | 'marquee';
  // A marquee's corner and the pointer, in the tracks' own coordinates
  // (they scroll with it, so the rectangle grows as it pans at the edges).
  startY?: number;
  originX?: number;
  originY?: number;
  tracks?: HTMLElement;
  additive?: boolean;
  startX: number;
  startScroll: number;
  moved: boolean;
  // The action block it started on (its tip key), if any.
  blockTip: string | null;
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
  selectedBlocks = NO_BLOCKS,
  onSelectBlock,
  onSelectBlocks,
  onSelectionKey,
  onDropBlock,
  axisSeconds,
  onHoverChip,
  memberRuns = NO_MEMBER_RUNS,
}: TimelineChartProps) => {
  const editing = onSelectBlock !== undefined;
  // The labels column on the left (in edit mode too).
  const labelPx = LABEL_PX;
  // Edit mode: the slot a drag would drop in (its moment) and what is
  // dragged: the guide line and the placeholder go there.
  const [slot, setSlot] = useState<DropSlot | null>(null);
  // The selection as a set, rebuilt only when it changes (not on each
  // render of a new array with the same blocks).
  const selectedKey = selectedBlocks.join(',');
  const selected = useMemo(
    () => new Set(selectedKey ? selectedKey.split(',') : []),
    [selectedKey]
  );
  // A Shift + drag selection rectangle, relative to the tracks.
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
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
        selected,
        editing,
        slot,
        memberRuns
      ),
    [
      view,
      actions,
      members,
      actionsById,
      ruler,
      selected,
      editing,
      slot,
      memberRuns,
    ]
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
  // The pointer's x over the tracks (null: not over them), for pastes.
  const hoverClientX = useRef<number | null>(null);
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
  // The bar under the pointer, told at once (the tip waits a moment).
  const hoveredChip = useRef<string | null>(null);
  const reportChip = (chipKey: string | null) => {
    if (hoveredChip.current !== chipKey) {
      hoveredChip.current = chipKey;
      onHoverChip?.(chipKey);
    }
  };
  const hideTip = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setHover(null);
    reportChip(null);
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
    reportChip(element.dataset.chip ?? null);
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
      reportChip(null);
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
    const mode = gesture.current?.mode;
    if (!element || (mode !== 'scrub' && mode !== 'marquee')) {
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
      if (mode === 'marquee') {
        updateMarquee();
      } else {
        seekRef.current(timeAtClient(pointerX.current));
      }
    }
    edgeFrame.current = requestAnimationFrame(panAtEdges);
  };
  useEffect(() => () => cancelAnimationFrame(edgeFrame.current), []);
  // The marquee from its corner to the pointer, in the tracks' coordinates.
  const pointerY = useRef(0);
  const updateMarquee = () => {
    const current = gesture.current;
    if (current?.mode !== 'marquee' || !current.tracks) {
      return;
    }
    const box = current.tracks.getBoundingClientRect();
    const x = pointerX.current - box.left;
    const y = pointerY.current - box.top;
    const originX = current.originX ?? x;
    const originY = current.originY ?? y;
    setMarquee({
      left: Math.min(originX, x),
      top: Math.min(originY, y),
      width: Math.abs(x - originX),
      height: Math.abs(y - originY),
    });
  };

  // Where an action block starts: its wait for a cooldown included (the
  // block starts where it was put).
  const blockStartOf = (tip: string | null) => {
    const group = tip
      ? actions.find((entry) => `a:${entry.key}` === tip)
      : undefined;
    return group ? group.start - group.waited : null;
  };
  const endGesture = (clientX: number) => {
    const current = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(edgeFrame.current);
    setPanning(false);
    // A click on the tracks (no drag) moves the playhead there; on an
    // action block, to where that block starts.
    if (current?.mode === 'pan' && !current.moved) {
      onSeek(blockStartOf(current.blockTip) ?? timeAtClient(clientX));
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
  // A picked block dragged with others: every picked block dims, as the
  // dragged one does.
  const [groupDragging, setGroupDragging] = useState(false);
  useDndMonitor({
    onDragStart: (event) => {
      dragging.current = true;
      hideTip();
      const payload = payloadOf(event);
      setGroupDragging(
        payload?.kind === 'move' &&
          selected.size > 1 &&
          selected.has(payload.blockUid)
      );
    },
    onDragMove: (event) => {
      const at = event.over?.id === TRACKS_DROP_ID ? dropTimeOf() : null;
      const payload = payloadOf(event);
      const actionId = draggedActionId(payload);
      // A picked block dragged with others: the whole selection.
      const group =
        payload?.kind === 'move' &&
        selected.size > 1 &&
        selected.has(payload.blockUid)
          ? Array.from(selected)
          : undefined;
      const next =
        at === null || !actionId
          ? null
          : {
              time: dropSlot(actions, at).time,
              actionId,
              rowMember: memberRowAtPointer(),
              blockUids: group,
            };
      // Only when the slot changes: the rows redraw with it.
      setSlot((current) =>
        current?.time === next?.time &&
        current?.actionId === next?.actionId &&
        current?.rowMember === next?.rowMember &&
        current?.blockUids?.length === next?.blockUids?.length
          ? current
          : next
      );
    },
    onDragCancel: () => {
      dragging.current = false;
      setGroupDragging(false);
      setSlot(null);
    },
    onDragEnd: (event) => {
      dragging.current = false;
      setGroupDragging(false);
      setSlot(null);
      const payload = payloadOf(event);
      const time = dropTimeOf();
      if (
        onDropBlock &&
        payload &&
        time !== null &&
        event.over?.id === TRACKS_DROP_ID
      ) {
        onDropBlock(payload, dropBefore(actions, time), memberRowAtPointer());
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
            } else if (editing && event.key === 'Escape') {
              onSelectionKey?.('clear');
            } else if (
              editing &&
              (event.key === 'Delete' || event.key === 'Backspace')
            ) {
              event.preventDefault();
              onSelectionKey?.('delete');
            } else if (
              editing &&
              (event.ctrlKey || event.metaKey) &&
              event.key.toLowerCase() === 'a'
            ) {
              event.preventDefault();
              onSelectionKey?.('all');
            } else if (
              editing &&
              (event.ctrlKey || event.metaKey) &&
              ['c', 'x', 'v'].includes(event.key.toLowerCase())
            ) {
              event.preventDefault();
              if (event.key.toLowerCase() === 'c') {
                onSelectionKey?.('copy');
              } else if (event.key.toLowerCase() === 'x') {
                onSelectionKey?.('cut');
              } else {
                // Over the tracks: between the blocks around the pointer,
                // as a drop there would go.
                const at = hoverClientX.current;
                onSelectionKey?.(
                  'paste',
                  at === null
                    ? undefined
                    : dropBefore(actions, timeAtClient(at))
                );
              }
            }
          }}
        >
          <div
            ref={setTracksRef}
            // At least the panel's height: with few rows (one character, few
            // buffs) the tracks still reach the bottom.
            className={cn(
              'relative flex min-h-full touch-none flex-col select-none [&_img]:pointer-events-none',
              panning ? 'cursor-grabbing' : 'cursor-grab',
              groupDragging && '[&_[data-selected]]:opacity-40'
            )}
            style={{ width: labelPx + trackWidth + 16 }}
            onDragStart={(event) => event.preventDefault()}
            // Edit mode: a click on a block picks it (or unpicks it).
            onClick={(event) => {
              const blockUid = (
                event.target as HTMLElement
              ).closest<HTMLElement>('[data-block-uid]')?.dataset.blockUid;
              if (editing && blockUid) {
                onSelectBlock?.(blockUid, {
                  range: event.shiftKey,
                  toggle: event.ctrlKey || event.metaKey,
                });
                // Picking several: the chart keeps the keys (Esc, Delete).
                scrollRef.current?.focus({ preventScroll: true });
                // Picked, the playhead goes to where it starts.
                const start = blockStartOf(
                  (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-tip^="a:"]'
                  )?.dataset.tip ?? null
                );
                if (start !== null) {
                  onSeek(start);
                }
              }
            }}
            onPointerOver={handleTipOver}
            onPointerOut={handleTipOut}
            onPointerLeave={() => {
              hoverClientX.current = null;
            }}
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
              // Edit mode, Shift + drag on empty tracks: a selection
              // rectangle instead of panning.
              if (editing && event.shiftKey && !onRuler) {
                const box = event.currentTarget.getBoundingClientRect();
                gesture.current = {
                  mode: 'marquee',
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: event.clientX - box.left,
                  originY: event.clientY - box.top,
                  tracks: event.currentTarget,
                  startScroll: 0,
                  moved: false,
                  blockTip: null,
                  additive: event.ctrlKey || event.metaKey,
                };
                pointerX.current = event.clientX;
                pointerY.current = event.clientY;
                event.currentTarget.setPointerCapture(event.pointerId);
                scrollRef.current?.focus({ preventScroll: true });
                // Near an edge, the tracks pan and the rectangle follows.
                cancelAnimationFrame(edgeFrame.current);
                edgeFrame.current = requestAnimationFrame(panAtEdges);
                return;
              }
              gesture.current = {
                mode: onRuler ? 'scrub' : 'pan',
                startX: event.clientX,
                startScroll: scrollRef.current?.scrollLeft ?? 0,
                moved: false,
                blockTip:
                  (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-tip^="a:"]'
                  )?.dataset.tip ?? null,
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
              // Where a paste goes (Ctrl/Cmd + V): the pointer's place.
              hoverClientX.current = event.clientX;
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
              if (current.mode === 'marquee') {
                current.moved = true;
                pointerX.current = event.clientX;
                pointerY.current = event.clientY;
                updateMarquee();
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
            onPointerUp={(event) => {
              const current = gesture.current;
              if (current?.mode === 'marquee') {
                gesture.current = null;
                cancelAnimationFrame(edgeFrame.current);
                setMarquee(null);
                // Every block the rectangle touches (in the tracks'
                // coordinates: it may have panned since it started).
                const box = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - box.left;
                const y = event.clientY - box.top;
                const originX = current.originX ?? x;
                const originY = current.originY ?? y;
                const left = Math.min(originX, x) + box.left;
                const right = Math.max(originX, x) + box.left;
                const top = Math.min(originY, y) + box.top;
                const bottom = Math.max(originY, y) + box.top;
                const uids = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    '[data-block-uid]'
                  )
                )
                  .filter((element) => {
                    const rect = element.getBoundingClientRect();
                    return (
                      rect.right >= left &&
                      rect.left <= right &&
                      rect.bottom >= top &&
                      rect.top <= bottom
                    );
                  })
                  .map((element) => element.dataset.blockUid ?? '')
                  .filter(Boolean);
                if (current.moved) {
                  onSelectBlocks?.(
                    Array.from(new Set(uids)),
                    current.additive ?? false
                  );
                }
                return;
              }
              endGesture(event.clientX);
            }}
            onPointerCancel={() => {
              setMarquee(null);
              gesture.current = null;
              cancelAnimationFrame(edgeFrame.current);
              setPanning(false);
            }}
          >
            {marquee && (
              <div
                aria-hidden
                data-testid='timeline-marquee'
                className='pointer-events-none absolute z-40 rounded-sm border border-sky-400 bg-sky-400/15'
                style={marquee}
              />
            )}
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
            {/* Where particles are caught (their Energy lands there), one
              faint line each, in their element's color. */}
            {particleArrivals(view).map((arrival) => (
              <span
                key={arrival.key}
                aria-hidden
                data-testid='timeline-particle-line'
                className={cn(
                  'pointer-events-none absolute inset-y-0 z-[5] w-0 -translate-x-1/2 border-l border-dashed',
                  PARTICLE_LINES[arrival.element] ?? PARTICLE_LINES.clear
                )}
                style={{ left: labelPx + ruler.toX(arrival.time) }}
              />
            ))}
            {/* Edit mode: where the block being dragged would go. */}
            {slot !== null && (
              <span
                aria-hidden
                data-testid='timeline-drop-guide'
                className='pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-sky-400 shadow-[0_0_6px_rgb(56_189_248/0.8)]'
                style={{ left: labelPx + ruler.toX(slot.time) }}
              />
            )}

            {/* Past the counted duration (60 s): blocks still play there,
              but their hits do not count, so it is dimmed. */}
            {view.countedDuration < view.duration && (
              <div
                aria-hidden
                data-testid='timeline-not-counted'
                className='pointer-events-none absolute inset-y-0 right-0 z-[15] border-l border-dashed border-amber-400/70 bg-slate-950/60'
                style={{ left: labelPx + ruler.toX(view.countedDuration) }}
              >
                <span className='sticky top-6 ml-1 inline-block rounded-sm bg-slate-900/90 px-1 py-px text-[9px] leading-none whitespace-nowrap text-amber-300'>
                  Not counted after {view.countedDuration} s
                </span>
              </div>
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
        content={hover ? tipOf(tips.get(hover.key)) : null}
        onEnter={keepTip}
        onLeave={hideTipSoon}
      />
    </>
  );
};

export default TimelineChart;
