import {
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Sparkle,
  UserRound,
  UserRoundX,
  Users,
} from 'lucide-react';
import {
  Children,
  ComponentProps,
  forwardRef,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import { Avatar, avatarVariants } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisclosureButton } from '@/components/ui/disclosure';
import { EmptyState } from '@/components/ui/empty-state';
import { Meter, SegmentedMeter } from '@/components/ui/meter';
import { Inset, Panel } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import { StatList, StatRow } from '@/components/ui/stat-row';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import PanelTitle from './PanelTitle';
import PanelToggle from './PanelToggle';
import { usePlayheadStore, useQuantizedTime } from './playhead';
import SectionHelp from './SectionHelp';
import { SectionHelpKey } from './sectionHelp';
import { ELEMENT_TEXT } from './sourceStyles';
import StatIcon from './StatIcon';
import { TimelineMember } from './TimelineChart';
import {
  actionAt,
  actionTitle,
  changesSpecialSystem,
  countUpTo,
  displayAction,
  eventCharacterState,
  EventPin,
  HitReaction,
  hitsOfAction,
  isReactionHit,
  isSystemResource,
  meterAt,
  PANEL_QUANTUM,
  pinOf,
  PLAYING_QUANTUM,
  reactionsByHit,
  resolvePin,
  samePanelProps,
  shownEvent,
} from './timelineData';
import { BlockTipCard } from './TimelineTooltip';
import useBlockQueue from './useBlockQueue';
import RotationActionIcon from '../rotation/RotationActionIcon';
import SkillCooldownIcon from '../team/SkillCooldownIcon';
import { getLoadedCharacter } from '../../_lib/characterData';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl } from '../../_lib/genshinIcons';
import {
  ActionPiece,
  BlockChip,
  BlockType,
  coordinatedUntil,
  EnemyHit,
  getHitFormula,
  InspectorView,
  spanAt,
  timerEnd,
} from '../../_lib/inspector';
import { readFlag, readNumber } from '../../_lib/readValue';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { parseValues } from '../../_lib/simulationValues';
import {
  CharacterState,
  getHitBonuses,
  STAT_LABELS,
  StateRow,
  TalentButton,
  TeamRun,
} from '../../_lib/team';
import { SimulationValues } from '../../_lib/types';

// The team inspector's lanes: blocks grouped by what they do, so the
// bonuses that change DMG never get lost among particles and states.
// Special mechanics (Nightsoul, Bond of Life) first: they frame the rest.
// A block's lane is its type's, except a mechanic that changes a special
// system, which goes with it (see laneOf).
const LANES: {
  id: string;
  title: string;
  types: BlockType[];
  help: SectionHelpKey;
}[] = [
  {
    id: 'special',
    title: 'Special mechanics',
    types: ['nightsoul', 'bondOfLife'],
    help: 'laneSpecial',
  },
  {
    id: 'buffs',
    title: 'Buffs & debuffs',
    types: ['bonus', 'debuff'],
    help: 'laneBuffs',
  },
  // Blocks that hit on their own (Escoffier's Mek, Nicole's projections).
  {
    id: 'coordinated',
    title: 'Coordinated attacks',
    types: ['coordinated', 'extraHit'],
    help: 'laneCoordinated',
  },
  {
    id: 'mechanics',
    title: 'Mechanics',
    types: ['cooldown', 'state'],
    help: 'laneMechanics',
  },
  {
    id: 'resources',
    title: 'Resources',
    types: ['energy', 'heal'],
    help: 'laneResources',
  },
];

// Mechanics that only drive a special system (Varesa's Fiery Plunge:
// points to 0, the Blessing ends) are part of it, not loose mechanics.
const laneOf = (chip: BlockChip): string => {
  // A bonus timed by a special system's resource (Crimson Moon's while
  // Bond of Life ≥ 30%) goes with that system.
  if (chip.meter && isSystemResource(chip.meter.resource)) {
    return 'special';
  }
  if (
    (chip.type === 'state' || chip.type === 'cooldown') &&
    changesSpecialSystem(chip.characterId, chip.blockId)
  ) {
    return 'special';
  }
  return (
    LANES.find((lane) => lane.types.includes(chip.type))?.id ?? 'mechanics'
  );
};

const short = (value: number) => formatNumber(Math.round(value * 10) / 10);
const seconds = (value: number) =>
  `${formatNumber(Math.round(value * 100) / 100)} s`;
const hitKey = (hit: Pick<EnemyHit, 'characterId' | 'index'>) =>
  `${hit.characterId}#${hit.index}`;

// One hit in Hit Details: its element and name (and who dealt it, for a
// hit from elsewhere), when it lands (a countdown until then, no taller
// than the text, so the row keeps its height), its CRIT, the reactions it
// set off and its DMG.
const HitRow = ({
  entry,
  time,
  who,
  selected = false,
  reactions,
  onClick,
}: {
  entry: EnemyHit;
  time: number;
  who?: string;
  selected?: boolean;
  reactions: HitReaction[];
  onClick: () => void;
}) => {
  const landed = entry.time <= time + 1e-6;
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-2xs hover:bg-muted',
        selected && 'bg-brand-600/20'
      )}
    >
      <ElementIcon element={entry.element} size={12} />
      <span
        className={cn(
          'truncate',
          landed ? 'text-muted-foreground' : 'text-subtle'
        )}
      >
        {entry.label}
      </span>
      {who && <span className='shrink-0 text-subtle'>· {who}</span>}
      {landed ? (
        <span className='shrink-0 text-2xs text-emerald-400/90 tabular-nums'>
          ✓ {seconds(entry.time)}
        </span>
      ) : (
        <Badge
          variant='brand'
          size='xs'
          className='text-2xs leading-none font-normal text-brand-300 tabular-nums'
        >
          lands {seconds(entry.time)} · in {short(entry.time - time)}s
        </Badge>
      )}
      {entry.isCrit && landed && (
        <Badge variant='warning' size='xs' className='font-bold text-amber-300'>
          CRIT
        </Badge>
      )}
      {landed &&
        reactions.map((reaction) => (
          <ReactionBadge key={reaction.reaction} {...reaction} />
        ))}
      <span
        className={cn(
          'ml-auto shrink-0 font-semibold tabular-nums',
          landed ? 'text-foreground' : 'text-subtle'
        )}
      >
        {formatNumber(Math.round(entry.damage))}
      </span>
    </button>
  );
};

// Hit Details' toggle for the coordinated attacks of other members or
// effects during the event, as a small icon with its description. Its own
// memo: the tooltip does not redraw with the panel's playhead.
const OthersToggle = memo(function OthersToggle({
  count,
  shown,
  onToggle,
}: {
  count: number;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-xs'
          aria-pressed={shown}
          aria-label={`${shown ? 'Hide' : 'Show'} others during it (${count})`}
          data-testid='timeline-event-others-toggle'
          onClick={onToggle}
          className={cn(
            'size-5 rounded text-subtle',
            shown && 'text-brand-300'
          )}
        >
          <Users className='size-3' />
        </Button>
      </TooltipTrigger>
      <TooltipContent className='max-w-64'>
        {shown ? 'Hide' : 'Show'} the coordinated attacks of other members or
        effects that hit during this event ({count}), in the list by time:
        before or after its hits.
      </TooltipContent>
    </Tooltip>
  );
});

// When the action was used: the time alone, what it is in its tooltip.
// Its own memo: the tooltip redraws only for another action, not with the
// panel's playhead.
const UsedAtBadge = memo(function UsedAtBadge({ start }: { start: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant='outline'
          size='sm'
          data-testid='timeline-event-used-at'
          tabIndex={0}
          className='ml-auto cursor-default font-mono text-muted-foreground tabular-nums'
        >
          {start.toFixed(3)}s
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Used at {start.toFixed(3)} s of the run</TooltipContent>
    </Tooltip>
  );
});

// A reaction a hit set off, in Results' reaction color; a transformative
// one (Overloaded) with its own DMG.
const ReactionBadge = ({
  reaction,
  damage,
  size = 'xs',
}: HitReaction & { size?: 'xs' | 'sm' }) => (
  <Badge
    variant='outline'
    size={size}
    data-testid='timeline-event-reaction'
    className='shrink-0 border-rose-400/40 font-medium text-rose-200 tabular-nums'
  >
    {reaction}
    {damage !== null && ` +${formatNumber(Math.round(damage))}`}
  </Badge>
);

// The panel follows the playhead: its repeated glyphs (elements, states,
// bonuses, blocks) are plain <img>s with the avatar's classes, not an
// Avatar each. A glyph sits on no tile.
const GLYPH_CLASS = avatarVariants({ shape: 'square', tile: false });
const ROUNDED_GLYPH_CLASS = avatarVariants({ tile: false });

const ElementIcon = ({ element, size }: { element: string; size: number }) => {
  const src = elementIconUrl(element);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={element}
      width={size}
      height={size}
      className={GLYPH_CLASS}
    />
  ) : null;
};

// The constellations on in a build (its c1…c6 flags), as in-game: a "C2"
// badge and six pips, lit for each one on; their names in the tooltip.
const ConstellationBadge = ({
  build,
  characterId,
}: {
  build: SimulationValues | undefined;
  characterId: string;
}) => {
  const values = build ? parseValues(build) : null;
  const { constellations } = getLoadedCharacter(characterId).character;
  const active = constellations.map(
    (entry) => values !== null && readFlag(values, `c${entry.level}`)
  );
  const count = active.filter(Boolean).length;
  const title = constellations
    .map(
      (entry, index) =>
        `${active[index] ? '✦' : '·'} C${entry.level} ${entry.name}`
    )
    .join('\n');
  return (
    <Badge
      data-testid='timeline-event-constellation'
      title={title}
      aria-label={`Constellation ${count}`}
      variant={count > 0 ? 'warning' : 'muted'}
      size='sm'
    >
      <span
        className={cn(
          'text-2xs font-bold tabular-nums',
          count > 0 ? 'text-amber-300' : 'text-subtle'
        )}
      >
        C{count}
      </span>
      <span aria-hidden className='flex gap-0.5'>
        {active.map((on, index) => (
          <span
            key={index}
            className={cn(
              'size-1.5 rotate-45 rounded-[1px]',
              on
                ? 'bg-amber-300 shadow-[0_0_4px_var(--color-amber-300)]'
                : 'bg-input'
            )}
          />
        ))}
      </span>
    </Badge>
  );
};

// A section of the panel. With `focus`, a button in its corner shows it
// alone (the others hide, so nothing above it moves while it changes);
// `hidden` hides it while another one is focused.
const Card = ({
  title,
  children,
  className,
  focus,
  actions,
  hidden = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  focus?: { label: string; active: boolean; onToggle: () => void };
  // Small icon buttons of its own, beside the focus one.
  actions?: ReactNode;
  hidden?: boolean;
}) =>
  hidden ? null : (
    // Each section on a box of its own.
    <Inset
      className={cn(
        'relative',
        focus && (actions ? 'pr-14' : 'pr-8'),
        focus?.active && 'border-brand-500/40',
        className
      )}
    >
      {(focus || actions) && (
        <span className='absolute top-2 right-2 flex items-center gap-0.5'>
          {actions}
          {focus && (
            <Button
              variant='ghost'
              size='icon-xs'
              aria-pressed={focus.active}
              aria-label={
                focus.active ? 'Show every section' : `Focus on ${focus.label}`
              }
              title={
                focus.active ? 'Show every section' : 'Focus on this section'
              }
              onClick={focus.onToggle}
              className='size-5 rounded text-subtle'
            >
              {focus.active ? (
                <Minimize2 className='size-3' />
              ) : (
                <Maximize2 className='size-3' />
              )}
            </Button>
          )}
        </span>
      )}
      {title && (
        <h3
          className={cn(
            'flex items-center gap-1.5 text-2xs font-semibold text-muted-foreground',
            // Room below only when the section is open (it has a body).
            Children.toArray(children).length > 0 && 'mb-1.5'
          )}
        >
          {title}
        </h3>
      )}
      {children}
    </Inset>
  );

// How much is left of a block, as a mini bar in its giver's color: a
// timer empties as it runs out; stacks light up one segment each. An
// instant block (a trigger firing) lasts nothing, so it gets no bar: a
// dot that fades out while it stays listed. The exact numbers are in its
// tooltip. It reads the playhead itself (at the panel's quantum), so its
// row is not drawn again as the time moves.
const BlockMeter = ({
  chip,
  quantum,
  at,
  barClass,
}: {
  chip: BlockChip;
  quantum: number;
  // A pinned event past its end: that time, no longer the playhead's.
  at?: number;
  barClass: string;
}) => {
  const live = useQuantizedTime(
    usePlayheadStore(),
    at === undefined ? quantum : Number.POSITIVE_INFINITY
  );
  const time = at ?? live;
  // A bonus while a resource meets a bound: the resource is its timer,
  // full far from the bound, empty at it.
  if (chip.meter) {
    const now = meterAt(chip.meter, time);
    return (
      <Meter
        data-testid='timeline-block-meter'
        aria-label={`${chip.meter.label} ${now.text} (${now.bound})`}
        value={now.share}
        className='w-16'
        indicatorClassName={barClass}
      />
    );
  }
  if (chip.kind === 'stacks' && chip.stacks) {
    const up = chip.stacks.filter(
      (stack) => stack.start <= time + 1e-6 && time < stack.end
    ).length;
    const segments = Math.max(chip.max ?? up, up, 1);
    return (
      <SegmentedMeter
        aria-label={`${up} of ${segments} stacks`}
        value={up}
        segments={segments}
        className='w-16'
        fillClassName={barClass}
      />
    );
  }
  if (chip.end === null) {
    return (
      <span
        aria-label='Just happened'
        className={cn('block size-1.5 rounded-full', barClass)}
        style={{ opacity: Math.max(0.15, 1 - (time - chip.start) / 2) }}
      />
    );
  }
  let share = 1;
  const span = spanAt(chip, time);
  const end = timerEnd(span);
  if (end !== null && end > span.start) {
    share = Math.min(1, Math.max(0, (end - time) / (end - span.start)));
  }
  return (
    <Meter
      aria-label={`${Math.round(share * 100)}% left`}
      value={share}
      className='w-16'
      indicatorClassName={barClass}
    />
  );
};

// An Active Effects row: on joining (and on each renewal, a new
// `pulseKey`) it lights up and fades out over a second; `held` keeps it
// lit softly (made by the event shown). `quiet`: drawn again for its
// tooltip, it does not light up for the application it already showed.
// The light is a CSS animation on a layer keyed by `pulseKey` (a renewal
// mounts it again, so it plays again): no state or timer, so no extra
// render. Its ref and props go through, as a tooltip's trigger.
const PulseRow = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & { pulseKey: number; held: boolean; quiet?: boolean }
>(function PulseRow(
  { pulseKey, held, quiet = false, className, children, ...props },
  ref
) {
  const quietKey = useRef(quiet ? pulseKey : null);
  return (
    <div
      ref={ref}
      {...props}
      className={cn('relative isolate', className, held && 'bg-brand-500/15')}
    >
      {quietKey.current !== pulseKey && (
        <span
          key={pulseKey}
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 bg-brand-400/35 animate-out fade-out-0 fill-mode-forwards duration-1000 ease-out'
        />
      )}
      {children}
    </div>
  );
});

// A row's tooltip, reading the playhead itself like the meter.
const LiveBlockTipCard = ({
  quantum,
  at,
  ...props
}: Omit<ComponentProps<typeof BlockTipCard>, 'time'> & {
  quantum: number;
  at?: number;
}) => {
  const live = useQuantizedTime(
    usePlayheadStore(),
    at === undefined ? quantum : Number.POSITIVE_INFINITY
  );
  const time = at ?? live;
  return <BlockTipCard {...props} time={time} />;
};

// A coordinated attack's line in Active Effects: what it dealt so far and
// its next hit (null: none yet).
const coordinatedText = (
  source: ReturnType<typeof coordinatedUntil>[number] | undefined,
  time: number
): string | null =>
  !source || source.hits + (source.nextAt === null ? 0 : 1) === 0
    ? null
    : `${source.hits} hits · ${formatNumber(Math.round(source.damage))}${
        source.nextAt !== null
          ? ` · next ${formatNumber(
              Math.round((source.nextAt - time) * 10) / 10
            )} s`
          : ''
      }`;

// Whose Active Effects: everyone's, or one member's (`value`, 'all').
// Its own memo: it redraws when picked, not with the panel's playhead.
const EffectsFilter = memo(function EffectsFilter({
  members,
  value,
  onChange,
}: {
  members: TimelineMember[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      type='single'
      size='2xs'
      variant='outline'
      aria-label='Effects of'
      data-testid='timeline-event-effects-of'
      value={value}
      onValueChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
      className='self-start'
    >
      <ToggleGroupItem value='all'>All</ToggleGroupItem>
      {members.map((member) => (
        <ToggleGroupItem
          key={member.characterId}
          value={member.characterId}
          aria-label={member.name}
          title={member.name}
          className='px-1'
        >
          <Avatar src={member.avatar} size={16} shape='circle' />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
});

// An Active Effects row: drawn again only when what it shows changes (it
// joining or being renewed, hovered on the chart, leaving), not when
// another row does, nor as the playhead moves: its meter and tip read it.
const EffectRow = memo(function EffectRow({
  chip,
  quantum,
  frozenAt,
  giver,
  leaving,
  hovered,
  held,
  pulseKey,
  coordinated,
  holderName,
  healedName,
}: {
  chip: BlockChip;
  // How often its meter and tip follow the playhead (s), or the time they
  // stopped at (a pinned event past its end).
  quantum: number;
  frozenAt?: number;
  giver: TimelineMember | undefined;
  leaving: boolean;
  hovered: boolean;
  // Made by the event shown: it stays lit.
  held: boolean;
  // Its application's start: it pulses when it joins, and when renewed.
  pulseKey: number;
  coordinated: string | null;
  holderName: string | null;
  healedName: string | null;
}) {
  // The giver's own color: purple, Iansan's.
  const giverBar = giver?.color.bar ?? 'bg-slate-400';
  // Its tooltip is mounted the first time the pointer comes over it: a
  // closed Radix tooltip on every row was most of the panel's work on each
  // move of the playhead.
  const [tipReady, setTipReady] = useState(false);
  const row = (
    <PulseRow
      data-hovered={hovered || undefined}
      pulseKey={pulseKey}
      held={!leaving && held}
      quiet={tipReady}
      onPointerEnter={tipReady ? undefined : () => setTipReady(true)}
      className={cn(
        'flex min-h-0 items-center gap-2 overflow-hidden rounded-md px-1.5 hover:bg-muted/60',
        // Folding out, it gives its room back.
        leaving ? 'py-0' : 'py-0.5',
        // Its bar is hovered on the chart: stronger than the event's own.
        hovered && '!bg-amber-400/30 ring-1 ring-amber-300/80'
      )}
    >
      <span className={cn('h-4 w-0.5 shrink-0 rounded-full', giverBar)} />
      {chip.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chip.iconUrl}
          alt=''
          width={18}
          height={18}
          className={GLYPH_CLASS}
        />
      ) : (
        <Sparkle className='size-[18px] shrink-0 text-subtle' />
      )}
      <span className='min-w-0 flex-1 leading-tight'>
        <span className='block truncate text-2xs text-muted-foreground'>
          {chip.label}
        </span>
        <span className='flex items-center gap-1 truncate text-2xs text-subtle'>
          {giver?.name ?? chip.characterId} · {chip.sourceTag}
          {chip.type === 'heal' && !chip.healed && <Users className='size-3' />}
        </span>
      </span>
      {/* A long value (Masque's) is cut; the tooltip has it whole. */}
      <span className='max-w-[45%] min-w-0 shrink-0 text-right text-2xs leading-tight tabular-nums'>
        {(chip.value ?? chip.short) && (
          <span className='block truncate font-semibold text-emerald-300'>
            {chip.value ?? chip.short}
          </span>
        )}
        {coordinated && (
          <span
            data-testid='timeline-coordinated-total'
            className='block truncate text-2xs text-brand-200'
          >
            {coordinated}
          </span>
        )}
        <span className='mt-1 flex justify-end'>
          <BlockMeter
            chip={chip}
            quantum={quantum}
            at={frozenAt}
            barClass={giverBar}
          />
        </span>
      </span>
    </PulseRow>
  );
  return (
    <li
      className={cn(
        'grid transition-all duration-300 ease-out',
        leaving
          ? 'grid-rows-[0fr] opacity-0'
          : 'grid-rows-[1fr] animate-in duration-300 fade-in-0 slide-in-from-bottom-1'
      )}
    >
      {tipReady ? (
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side='left' variant='card'>
            <LiveBlockTipCard
              chip={chip}
              quantum={quantum}
              at={frozenAt}
              owner={giver ?? null}
              holderName={holderName}
              healedName={healedName}
              accentClass={giverBar}
            />
          </TooltipContent>
        </Tooltip>
      ) : (
        row
      )}
    </li>
  );
});

// One line of the owner's state: its value out of the max as a bar, and
// what the event changed. It shows only when the member has it, and that
// is the same for their whole run, so nothing jumps.
const StateLine = ({
  row,
  bar,
  'data-testid': testId,
}: {
  row: StateRow;
  bar: string;
  'data-testid'?: string;
}) => {
  const unit = row.format === 'percent' ? '%' : '';
  const { value, before } = row;
  const changed =
    value !== null &&
    before !== null &&
    before !== undefined &&
    Math.abs(before - value) > 1e-6;
  return (
    <div data-testid={testId} className='flex h-[30px] items-center gap-2'>
      {row.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.iconUrl}
          alt=''
          width={18}
          height={18}
          className={ROUNDED_GLYPH_CLASS}
        />
      ) : (
        <Sparkle className='size-[18px] shrink-0 text-subtle/60' />
      )}
      <span className='min-w-0 flex-1 leading-tight'>
        <span className='flex items-center gap-1'>
          <span className='truncate text-muted-foreground'>{row.label}</span>
          <span className='ml-auto shrink-0 text-2xs text-subtle tabular-nums'>
            {changed
              ? `${short(before)}${unit} → ${short(value)}${unit}`
              : row.remaining
              ? `${short(row.remaining)}s left`
              : ''}
          </span>
        </span>
        <Meter
          value={value ?? 0}
          max={row.max ?? 0}
          className='mt-0.5'
          indicatorClassName={bar}
        />
      </span>
      <span className='w-16 shrink-0 text-right font-semibold text-foreground tabular-nums'>
        {value === null ? (
          <span className='font-normal text-subtle'>—</span>
        ) : (
          <>
            {short(value)}
            {row.max !== null && (
              <span className='font-normal text-subtle'>/{short(row.max)}</span>
            )}
            {unit}
          </>
        )}
      </span>
    </div>
  );
};

// Each special system's bar: Bond of Life rose, the others (Nightsoul,
// Verdant Dew) fuchsia.
const mechanicBar = (id: string) =>
  id === 'bondOfLife' ? 'bg-rose-500' : 'bg-fuchsia-500';

// The owner's state: its E and Q (the Q with its Energy), its special
// system and its weapon's stacks, each line only when the member has it.
// An E or Q button as in-game, with what it is called now: a form's name
// while one replaces it (Varesa's Fiery Passion Rush). Two fixed lines
// under it, so nothing moves when the form or the Energy changes. The
// Q's second line is a bar of what fills it (Energy, Fighting Spirit).
const TalentHud = ({
  button,
  kind,
  element,
  energy,
  bar,
}: {
  button: TalentButton;
  kind: 'E' | 'Q';
  element: string;
  energy?: StateRow | null;
  bar?: string;
}) => (
  <div className='flex min-w-0 flex-1 items-center gap-2'>
    <SkillCooldownIcon
      icon={button.icon}
      label={kind}
      cooldown={button.cooldown}
      element={element}
      energy={
        energy && energy.value !== null && (energy.needed ?? energy.max)
          ? { value: energy.value, max: energy.needed ?? energy.max ?? 0 }
          : kind === 'Q'
          ? null
          : undefined
      }
      size={kind === 'Q' ? 40 : 34}
    />
    <span className='min-w-0 leading-tight'>
      <span
        className={cn(
          // Two lines for a long name (Riding the Night-Rainbow), so it is
          // not cut: the HUD's row has room for them and the charges.
          'line-clamp-2 break-words',
          button.form ? 'font-medium text-amber-300' : 'text-muted-foreground'
        )}
        title={button.form ?? button.label}
      >
        {button.form ?? button.label}
      </span>
      {kind === 'Q' && energy?.value !== null && energy?.value !== undefined ? (
        <span
          data-testid='timeline-burst-charge'
          title={`${energy.label} ${Math.floor(energy.value)}/${
            energy.needed ?? energy.max ?? '—'
          }`}
          className='mt-1 flex items-center gap-1.5'
        >
          <Meter
            value={energy.value}
            max={Math.max(1, energy.needed ?? energy.max ?? 1)}
            className='w-14'
            indicatorClassName={bar}
          />
          <span className='text-2xs text-subtle tabular-nums'>
            {Math.floor(energy.value)}
          </span>
        </span>
      ) : (
        // The seconds left are on the icon, as in-game: here, only the
        // charges of a talent that has several.
        button.cooldown.charges > 1 && (
          <span className='block truncate text-2xs text-subtle tabular-nums'>
            {button.cooldown.ready}/{button.cooldown.charges} charges
          </span>
        )
      )}
    </span>
  </div>
);

const CharacterStateRows = ({
  state,
  ownerBar,
  element,
}: {
  state: CharacterState;
  ownerBar: string;
  element: string;
}) => (
  <div data-testid='timeline-event-state' className='flex flex-col text-2xs'>
    {/* The E and the Q, as the game's buttons. */}
    <div className='mb-1 flex h-11 items-center gap-2'>
      <TalentHud button={state.skill} kind='E' element={element} />
      <TalentHud
        button={state.burst}
        kind='Q'
        element={element}
        energy={state.energy}
        bar={ownerBar}
      />
    </div>
    {state.mechanic && (
      <StateLine
        data-testid='timeline-event-mechanic'
        row={state.mechanic}
        bar={mechanicBar(state.mechanic.id)}
      />
    )}
    {state.weapon.value !== null && (
      <StateLine row={state.weapon} bar={ownerBar} />
    )}
  </div>
);

type FocusId = 'hits' | 'formula' | 'bonuses' | 'blocks';

type EventPanelProps = {
  view: InspectorView;
  run: TeamRun;
  members: TimelineMember[];
  actionsById: Map<string, RotationAction>;
  time: number;
  // The run is playing: it follows the playhead less often (see
  // samePanelProps).
  playing?: boolean;
  // The members' builds (their character screens, to compare a hit's
  // stats with).
  builds: SimulationValues[];
  collapsed: boolean;
  onToggle: () => void;
  // Edit mode: the block picked on the chart, shown while nothing is
  // pinned.
  pickedBlock?: string | null;
  // The buff or debuff bar hovered on the chart: lit in Active Effects.
  hoveredChip?: string | null;
  // Moves the playhead (a hit picked in the list goes to it).
  onSeek?: (time: number) => void;
};

// The Selected Event: the action at the playhead (or a pinned one) and
// what it did, top to bottom: the character (who, and their state then),
// its hits, the DMG formula of one hit, the bonuses on it, and every
// block up at that moment, in the team inspector's lanes (a queue: blocks
// join at the end, stay in place and fold out when over).
const EventPanel = ({
  view,
  run,
  members,
  actionsById,
  time: playheadTime,
  playing = false,
  builds,
  collapsed,
  onToggle,
  pickedBlock = null,
  hoveredChip = null,
  onSeek,
}: EventPanelProps) => {
  // A pin names a rotation block, so it stays through the re-run every
  // edit makes (a Wait's seconds, a block moved…) and while other blocks
  // are picked. Without one, the picked block is shown.
  const [pinned, setPinned] = useState<EventPin | null>(null);
  // A pinned character instead: the panel follows that member, showing
  // their action at the playhead, all of it live. One pin at a time.
  const [followed, setFollowed] = useState<string | null>(null);
  const pinEvent = (pin: EventPin | null) => {
    setPinned(pin);
    setFollowed(null);
  };
  const resolvedPin = pinned ? resolvePin(view, pinned) : null;
  const resolved = shownEvent(view, pinned, pickedBlock);
  // Its block is gone (removed, another scenario): back to the playhead.
  useEffect(() => {
    if (pinned && !resolvePin(view, pinned)) {
      setPinned(null);
    }
  }, [view, pinned]);
  // A followed member who left the team: back to the playhead.
  const followedId =
    followed && members.some((member) => member.characterId === followed)
      ? followed
      : null;
  const followedActions = useMemo(
    () =>
      followedId
        ? view.actions.filter((entry) => entry.characterId === followedId)
        : view.actions,
    [view, followedId]
  );

  // The event: the ability a character (the followed one, if any) used at
  // the playhead (the action playing, else the latest started). Its hits
  // are known from the moment it is used, even those that land seconds
  // later (Iansan's E, a grenade): each shows when it lands.
  const atCursor = actionAt(followedActions, playheadTime);
  const action: ActionPiece | undefined = resolved ? resolved.action : atCursor;
  const hits = useMemo(
    () => (action ? hitsOfAction(view, action) : []),
    [view, action]
  );
  // The reactions each hit set off (once per run).
  const hitReactions = useMemo(() => reactionsByHit(view), [view]);
  const reactionsOf = (entry: EnemyHit) =>
    hitReactions.get(hitKey(entry)) ?? [];
  // The panel's moment. A pinned event is live only while it plays, from
  // its start to its last hit: before or after, the panel shows it at that
  // edge (its state, the stats and Active Effects stop there). Otherwise,
  // the playhead.
  // The event's stretch: from its start (its wait in) to its last hit.
  const eventStart = action ? action.start - action.waited : 0;
  const eventEnd = action
    ? Math.max(action.end, ...hits.map((entry) => entry.time))
    : 0;
  const time =
    resolvedPin && action
      ? Math.min(Math.max(playheadTime, eventStart), eventEnd)
      : playheadTime;
  // Stopped there: the effects' meters stop following the playhead too.
  const frozenAt = time === playheadTime ? undefined : time;
  const { queued, exiting, upNow } = useBlockQueue(view.chips, time);
  // Each coordinated attack's hits and DMG so far, by member and block.
  const coordinated = useMemo(
    () =>
      new Map(
        coordinatedUntil(view, time).map((source) => [
          `${source.characterId}|${source.sourceId}`,
          source,
        ])
      ),
    [view, time]
  );
  const [openLanes, setOpenLanes] = useState(true);
  // Active Effects of one member only (the one who gave them), or all; a
  // member who left the team falls back to all.
  const [effectsOf, setEffectsOf] = useState('all');
  const shownGiver = members.some((member) => member.characterId === effectsOf)
    ? effectsOf
    : 'all';
  const shownChips =
    shownGiver === 'all'
      ? queued
      : queued.filter((chip) => chip.characterId === shownGiver);
  const [openFormula, setOpenFormula] = useState(false);
  const [openBonuses, setOpenBonuses] = useState(false);
  const [openHits, setOpenHits] = useState(false);
  // Hit Details' coordinated attacks from elsewhere during the event: the
  // other members' and other effects' (off by default).
  const [showOthers, setShowOthers] = useState(false);
  const toggleOthers = useCallback(() => setShowOthers((shown) => !shown), []);
  const own = useMemo(() => new Set(hits), [hits]);
  const othersDuring = useMemo(
    () =>
      action
        ? view.hits.filter(
            (entry) =>
              entry.coordinated &&
              !own.has(entry) &&
              entry.time >= eventStart - 1e-6 &&
              entry.time <= eventEnd + 1e-6
          )
        : [],
    [view, action, own, eventStart, eventEnd]
  );
  // The list: its hits, and with the others on, theirs among them by time.
  const listed = useMemo(
    () =>
      showOthers
        ? [...hits, ...othersDuring].sort((a, b) => a.time - b.time)
        : hits,
    [showOthers, hits, othersDuring]
  );
  // The section shown alone (open), or every section.
  const [focused, setFocused] = useState<FocusId | null>(null);
  const focusOf = (id: FocusId, label: string) => ({
    label,
    active: focused === id,
    onToggle: () => {
      setFocused((current) => (current === id ? null : id));
      // Focused, a section is open.
      if (id === 'hits') setOpenHits(true);
      if (id === 'formula') setOpenFormula(true);
      if (id === 'bonuses') setOpenBonuses(true);
      if (id === 'blocks') setOpenLanes(true);
    },
  });
  const hiddenBy = (id: FocusId | 'header') =>
    focused !== null && focused !== id;

  const now = time + 1e-6;
  const landed = hits.filter((hit) => hit.time <= now);
  // The reactions its landed hits set off, once each.
  const landedReactions = Array.from(
    new Set(
      landed.flatMap((entry) => reactionsOf(entry).map((r) => r.reaction))
    )
  );
  const pending = hits.filter((hit) => hit.time > now);
  const nextHit = pending[0] ?? null;
  // The hit shown: the one picked, else the latest landed, else the next
  // one (upcoming), so its breakdown is there from the start.
  const hit = resolved?.hit || landed.at(-1) || nextHit || null;
  const upcoming = hit !== null && hit.time > now;
  const memberRun = hit
    ? run.members.find((entry) => entry.characterId === hit.characterId)
    : undefined;
  const logEntry = hit && memberRun ? memberRun.hitLog[hit.index] : undefined;
  const ownerId = action?.characterId ?? null;
  const owner = members.find((member) => member.characterId === ownerId);
  const character = ownerId ? getLoadedCharacter(ownerId).character : null;
  // Worked out once per hit shown, not on every frame.
  const formula = useMemo(
    () =>
      logEntry && character
        ? getHitFormula(logEntry, STAT_LABELS[character.scalingStat] ?? 'Stat')
        : null,
    [logEntry, character]
  );
  const bonuses = useMemo(
    () =>
      logEntry && memberRun ? getHitBonuses(run, memberRun, logEntry) : [],
    [logEntry, memberRun, run]
  );
  const ownerRun = run.members.find((entry) => entry.characterId === ownerId);
  // The owner's stats at the playhead, even with an event pinned: those of
  // their latest hit up to it, from any action (the engine works stats
  // out on each hit, with every buff up then); before their first hit,
  // that first one. The hit's own DMG, breakdown and bonuses stay the
  // event's (logEntry).
  const ownerHits = useMemo(
    () =>
      view.hits
        // A reaction's own hit (Overloaded) has no stats of the member.
        .filter(
          (entry) => entry.characterId === ownerId && !isReactionHit(entry)
        )
        .sort((a, b) => a.time - b.time),
    [view, ownerId]
  );
  const ownerHitTimes = useMemo(
    () => ownerHits.map((entry) => entry.time),
    [ownerHits]
  );
  const latestOwnHit =
    ownerHits[countUpTo(ownerHitTimes, now) - 1] ?? ownerHits[0] ?? null;
  const statsEntry =
    latestOwnHit && ownerRun ? ownerRun.hitLog[latestOwnHit.index] : undefined;
  // Those stats against the character screen's (the build's totals).
  const hitStats = useMemo(() => {
    const build = builds.find((values) => values.character === ownerId);
    const screen = build ? parseValues(build) : null;
    const scaling = character?.scalingStat ?? 'atk';
    const read = (field: string) => (screen ? readNumber(screen, field) : 0);
    const signed = (value: number, suffix = '') =>
      `${value > 0 ? '+' : ''}${formatNumber(
        Math.round(value * 10) / 10
      )}${suffix}`;
    const row = (
      [label, shortLabel]: [string, string],
      field: string | null,
      value: number | null,
      base: number,
      suffix = ''
    ) => {
      const delta = value === null ? 0 : value - base;
      return {
        label,
        shortLabel,
        field,
        value:
          value === null
            ? '—'
            : `${formatNumber(Math.round(value * 10) / 10)}${suffix}`,
        delta: Math.abs(delta) < 0.05 ? 0 : delta,
        deltaText:
          value === null || Math.abs(delta) < 0.05 ? '' : signed(delta, suffix),
      };
    };
    const entry = statsEntry ?? null;
    const ownBonus =
      (entry && character && entry.element === character.element
        ? read('elementalBonus')
        : 0) + read('bonus');
    return [
      row(
        [STAT_LABELS[scaling] ?? scaling, STAT_LABELS[scaling] ?? scaling],
        scaling,
        entry?.stat ?? null,
        read(scaling)
      ),
      row(
        ['CRIT Rate', 'CR'],
        'cr',
        entry ? entry.critRate * 100 : null,
        read('cr'),
        '%'
      ),
      row(
        ['CRIT DMG', 'CD'],
        'cd',
        entry?.critDamage !== undefined ? entry.critDamage * 100 : null,
        read('cd'),
        '%'
      ),
      row(
        ['DMG Bonus', 'DMG%'],
        null,
        entry ? entry.totalBonus : null,
        ownBonus,
        '%'
      ),
    ];
  }, [builds, ownerId, character, statsEntry]);
  const damage = landed.reduce((sum, entry) => sum + entry.damage, 0);
  const rounded = landed.map((entry) => Math.round(entry.damage));
  const same = rounded.length > 1 && rounded.every((d) => d === rounded[0]);
  const rotationAction = action
    ? displayAction(action, actionsById)
    : undefined;
  const actionName = action ? actionTitle(action, rotationAction) : '';
  // The elements its hits deal (Arlecchino's Normal Attack: Physical, or
  // Pyro in Masque), landed or not.
  const actionElements = Array.from(
    new Set(hits.map((entry) => entry.element))
  );
  // The owner's state at the playhead (cooldowns run down as it moves,
  // a pinned event too), with what the event changed since it was used.
  const ownerState =
    ownerRun && action ? eventCharacterState(ownerRun, action, time) : null;
  const memberOf = (id: string) =>
    members.find((member) => member.characterId === id);

  return (
    <Panel
      data-testid='timeline-event'
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !collapsed && 'h-full'
      )}
    >
      <div className='flex shrink-0 items-center gap-2 px-3 py-2'>
        <PanelTitle section='event' className='shrink-0 whitespace-nowrap'>
          Selected Event
        </PanelTitle>
        <span className='min-w-0 truncate text-2xs text-subtle'>
          {resolvedPin
            ? frozenAt === undefined
              ? 'pinned event'
              : 'pinned event · stopped'
            : followedId
            ? `follows ${memberOf(followedId)?.name ?? followedId}`
            : resolved
            ? 'selected block'
            : 'follows the playhead'}
        </span>
        {/* Pin the event (live only while it plays), or its character
            (their actions, live as the playhead moves). */}
        <Button
          variant='ghost'
          size='icon-sm'
          data-testid='timeline-event-pin'
          aria-pressed={resolvedPin !== null}
          aria-label={resolvedPin ? 'Unpin the event' : 'Pin the event'}
          title={
            resolvedPin
              ? 'Unpin the event'
              : 'Pin this event: it stays, live while it plays, then stops at its end'
          }
          disabled={!action}
          onClick={() =>
            pinEvent(pinned || !action ? null : pinOf(view, action, hit))
          }
          className='ml-auto text-subtle'
        >
          {resolvedPin ? <PinOff /> : <Pin />}
        </Button>
        <Button
          variant='ghost'
          size='icon-sm'
          data-testid='timeline-event-follow'
          aria-pressed={followedId !== null}
          aria-label={
            followedId
              ? `Stop following ${memberOf(followedId)?.name ?? followedId}`
              : `Pin ${owner?.name ?? 'the character'}`
          }
          title={
            followedId
              ? `Stop following ${memberOf(followedId)?.name ?? followedId}`
              : `Pin ${
                  owner?.name ?? 'the character'
                }: follow their actions as the playhead moves`
          }
          disabled={!followedId && !ownerId}
          onClick={() => {
            setFollowed(followedId ? null : ownerId);
            setPinned(null);
          }}
          className='text-subtle'
        >
          {followedId ? <UserRoundX /> : <UserRound />}
        </Button>
        <PanelToggle label='event' collapsed={collapsed} onToggle={onToggle} />
      </div>

      {!collapsed && (
        <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5 text-xs'>
          {!action || !owner || !character ? (
            <EmptyState>
              {followedId && !action
                ? `${
                    memberOf(followedId)?.name ?? followedId
                  } has not acted yet: play or move the playhead.`
                : 'Nothing played yet: play or move the playhead.'}
            </EmptyState>
          ) : (
            <>
              {/* The character at this moment: who used what and when, its
                  DMG, their E and Q, special system and weapon (at the
                  playhead), and the stats of the hit shown. */}
              <Card hidden={hiddenBy('header')} className='flex flex-col gap-2'>
                <div className='flex gap-2.5'>
                  <Avatar src={owner.avatar} size={44} className='rounded-lg' />
                  <div className='min-w-0 flex-1'>
                    {/* A narrow panel: the time goes under the name rather
                        than cutting it. */}
                    <div className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
                      <span
                        className={cn(
                          'truncate text-sm font-semibold',
                          owner.color.text
                        )}
                      >
                        {owner.name}
                      </span>
                      <ElementIcon element={character.element} size={16} />
                      <ConstellationBadge
                        build={builds.find(
                          (values) => values.character === owner.characterId
                        )}
                        characterId={owner.characterId}
                      />
                      <SectionHelp section='character' />
                      <UsedAtBadge start={action.start} />
                    </div>
                    <Badge
                      variant='muted'
                      size='sm'
                      className='mt-1 max-w-full font-normal'
                    >
                      {rotationAction && (
                        <RotationActionIcon
                          action={rotationAction}
                          size={14}
                          className='bg-transparent p-0 ring-0'
                        />
                      )}
                      <span className='truncate'>{actionName}</span>
                      {actionElements.map((element) => (
                        <span
                          key={element}
                          data-testid='timeline-event-action-element'
                          className={cn(
                            'inline-flex shrink-0 items-center gap-0.5 pl-1',
                            ELEMENT_TEXT[element] ?? 'text-muted-foreground'
                          )}
                        >
                          <ElementIcon element={element} size={12} />
                          {element}
                        </span>
                      ))}
                    </Badge>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <p className='text-muted-foreground tabular-nums'>
                    Damage:{' '}
                    {landed.length === 0 ? (
                      <span className='text-subtle'>
                        {hits.length === 0 ? 'no hits' : '—'}
                      </span>
                    ) : (
                      <>
                        <span className='font-semibold text-foreground'>
                          {same
                            ? `${formatNumber(rounded[0])} × ${rounded.length}`
                            : formatNumber(Math.round(damage))}
                        </span>
                        {same && (
                          <span className='text-subtle'>
                            {' '}
                            ({formatNumber(Math.round(damage))} total)
                          </span>
                        )}
                      </>
                    )}
                    {/* Always there (its room kept), so nothing below
                        moves when the hits are all in. */}
                    <span
                      className={cn(
                        'block h-4 text-2xs',
                        nextHit ? 'text-brand-300' : 'text-subtle'
                      )}
                    >
                      {nextHit
                        ? `${pending.length} hit${
                            pending.length === 1 ? '' : 's'
                          } to land · next in ${short(nextHit.time - time)}s`
                        : hits.length > 0
                        ? 'All hits landed'
                        : ''}
                    </span>
                  </p>
                  {/* The hit shown: a CRIT, the reactions it set off. */}
                  {hit && !upcoming && (
                    <span className='ml-auto flex shrink-0 items-center gap-1'>
                      {hit.isCrit && (
                        <Badge
                          variant='warning'
                          size='sm'
                          className='font-semibold text-amber-300'
                        >
                          <Sparkle className='size-3' />
                          Critical Hit
                        </Badge>
                      )}
                      {reactionsOf(hit).map((entry) => (
                        <ReactionBadge
                          key={entry.reaction}
                          size='sm'
                          {...entry}
                        />
                      ))}
                    </span>
                  )}
                </div>
                {ownerState && (
                  <CharacterStateRows
                    state={ownerState}
                    ownerBar={owner.color.bar}
                    element={character.element}
                  />
                )}
                {/* The stats of the hit shown (every buff of that moment
                    in), and what they gain over the character screen.
                    Always there, so nothing moves. A line above: they are
                    the hit's, the lines above the playhead's. */}
                {/* A narrow panel shows the short names (CR, CD): the
                    full ones from 22rem. */}
                <StatList
                  data-testid='timeline-event-stats'
                  className='@container grid grid-cols-2 gap-x-3 gap-y-1 border-t border-muted pt-2'
                >
                  {hitStats.map((row) => (
                    <StatRow
                      key={row.label}
                      size='2xs'
                      className='items-center gap-1.5'
                      // Its room kept with no icon, so the labels line up.
                      icon={
                        <span className='size-3.5 shrink-0'>
                          {row.field && (
                            <StatIcon
                              field={row.field}
                              className='size-3.5 text-muted-foreground opacity-50'
                            />
                          )}
                        </span>
                      }
                      label={
                        <>
                          <span title={row.label} className='@[22rem]:hidden'>
                            {row.shortLabel}
                          </span>
                          <span className='hidden @[22rem]:inline'>
                            {row.label}
                          </span>
                        </>
                      }
                      labelClassName='min-w-0 truncate'
                      value={
                        <>
                          {row.value}
                          {/* What it gains over the character screen. */}
                          <span
                            className={cn(
                              'ml-1.5 inline-block w-11 font-normal',
                              row.delta > 0
                                ? 'text-emerald-400'
                                : row.delta < 0
                                ? 'text-rose-400'
                                : 'text-subtle/60'
                            )}
                          >
                            {row.deltaText}
                          </span>
                        </>
                      }
                      valueClassName='shrink-0'
                    />
                  ))}
                </StatList>
              </Card>

              <Card
                focus={focusOf('hits', 'Hit Details')}
                hidden={hiddenBy('hits')}
                actions={
                  openHits && othersDuring.length > 0 ? (
                    <OthersToggle
                      count={othersDuring.length}
                      shown={showOthers}
                      onToggle={toggleOthers}
                    />
                  ) : undefined
                }
                title={
                  <DisclosureButton open={openHits} onOpenChange={setOpenHits}>
                    Hit Details
                    <SectionHelp section='hits' />
                    {!openHits && (
                      <span className='ml-auto truncate text-2xs font-normal text-subtle tabular-nums'>
                        {landed.length}/{hits.length} landed
                        {landedReactions.length > 0 && (
                          <span className='text-rose-200'>
                            {' · '}
                            {landedReactions.join(', ')}
                          </span>
                        )}
                      </span>
                    )}
                  </DisclosureButton>
                }
              >
                {openHits && (
                  <>
                    <StatList className='grid grid-cols-3 gap-2'>
                      <StatRow
                        layout='stacked'
                        size='2xs'
                        label='Landed'
                        value={`${landed.length}/${hits.length}`}
                      />
                      <StatRow
                        layout='stacked'
                        size='2xs'
                        label={upcoming ? 'Next hit' : 'This hit'}
                        value={hit ? formatNumber(Math.round(hit.damage)) : '—'}
                        valueClassName={cn(upcoming && 'text-brand-300')}
                      />
                      <StatRow
                        layout='stacked'
                        size='2xs'
                        label='Element'
                        value={
                          hit ? (
                            <>
                              <ElementIcon element={hit.element} size={14} />
                              {hit.element}
                            </>
                          ) : (
                            '—'
                          )
                        }
                        valueClassName={
                          hit
                            ? cn(
                                'flex items-center gap-1',
                                ELEMENT_TEXT[hit.element] ??
                                  'text-muted-foreground'
                              )
                            : 'text-subtle'
                        }
                      />
                    </StatList>
                    {/* With `Others` on (the card's icon), the coordinated
                        attacks from elsewhere that hit while it played sit
                        among its hits, by time. */}
                    {listed.length > 0 && (
                      <ul
                        data-testid='timeline-event-hits'
                        className='mt-2 flex flex-col gap-0.5'
                      >
                        {listed.map((entry) =>
                          own.has(entry) ? (
                            <li key={hitKey(entry)}>
                              <HitRow
                                entry={entry}
                                time={time}
                                selected={
                                  hit !== null && hitKey(entry) === hitKey(hit)
                                }
                                reactions={reactionsOf(entry)}
                                onClick={() => {
                                  pinEvent(pinOf(view, action, entry));
                                  onSeek?.(entry.time);
                                }}
                              />
                            </li>
                          ) : (
                            <li
                              key={hitKey(entry)}
                              data-testid='timeline-event-other-hit'
                            >
                              <HitRow
                                entry={entry}
                                time={time}
                                who={
                                  memberOf(entry.characterId)?.name ??
                                  entry.characterId
                                }
                                reactions={reactionsOf(entry)}
                                onClick={() => onSeek?.(entry.time)}
                              />
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  </>
                )}
              </Card>

              {/* The DMG formula: a one-line button, closed by default (it
                is long; open, it stays open). The line is always there,
                so nothing below moves. */}
              <Card
                focus={focusOf('formula', 'Damage Breakdown')}
                hidden={hiddenBy('formula')}
              >
                <DisclosureButton
                  open={openFormula}
                  onOpenChange={setOpenFormula}
                  data-testid='timeline-event-formula-toggle'
                  disabled={!formula}
                  className='text-2xs font-semibold text-muted-foreground disabled:text-subtle'
                >
                  Damage Breakdown
                  <SectionHelp section='formula' />
                  <span
                    className={cn(
                      'ml-auto text-2xs font-normal',
                      !formula
                        ? 'text-subtle'
                        : formula.matches
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    )}
                  >
                    {!formula
                      ? 'no hits'
                      : `${upcoming ? 'upcoming hit · ' : ''}${
                          formula.matches ? '✓ matches' : '✗ does not match'
                        }`}
                  </span>
                </DisclosureButton>
                {openFormula && formula && hit && (
                  <table
                    data-testid='timeline-event-formula'
                    className='mt-1.5 w-full text-2xs tabular-nums'
                  >
                    <tbody>
                      {formula.rows.map((row) => (
                        <tr
                          key={row.label}
                          className='border-b border-muted/80'
                        >
                          <td className='py-0.5 text-subtle'>{row.label}</td>
                          <td className='py-0.5 text-right text-muted-foreground'>
                            {row.value}
                          </td>
                          <td className='py-0.5 pl-2 text-right font-medium text-foreground'>
                            {row.result}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className='pt-1 font-semibold text-foreground'>
                          Total
                        </td>
                        <td />
                        <td className='pt-1 pl-2 text-right font-bold text-amber-300'>
                          {formatNumber(Math.round(hit.damage))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </Card>

              {/* The bonuses on the hit: a one-line button, closed by
                default and always there, so nothing below moves. */}
              <Card
                focus={focusOf('bonuses', 'Bonuses on this hit')}
                hidden={hiddenBy('bonuses')}
              >
                <DisclosureButton
                  open={openBonuses}
                  onOpenChange={setOpenBonuses}
                  data-testid='timeline-event-bonuses-toggle'
                  disabled={bonuses.length === 0}
                  className='text-2xs font-semibold text-muted-foreground disabled:text-subtle'
                >
                  Bonuses on this hit
                  <SectionHelp section='bonuses' />
                  <span className='ml-auto text-2xs font-normal text-subtle tabular-nums'>
                    {bonuses.length === 0 ? 'none' : bonuses.length}
                  </span>
                </DisclosureButton>
                {openBonuses && bonuses.length > 0 && (
                  <ul className='mt-1.5 flex flex-col gap-1'>
                    {bonuses.map((bonus) => (
                      <li key={bonus.id} className='flex items-center gap-2'>
                        {bonus.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={bonus.iconUrl}
                            alt=''
                            width={18}
                            height={18}
                            className={ROUNDED_GLYPH_CLASS}
                          />
                        ) : (
                          <span className='size-[18px] shrink-0' />
                        )}
                        <span className='min-w-0 flex-1 leading-tight'>
                          <span className='block truncate text-2xs text-muted-foreground'>
                            {bonus.label}
                          </span>
                          <span className='block truncate text-2xs text-subtle'>
                            {bonus.from}
                          </span>
                        </span>
                        <span className='shrink-0 text-right text-2xs leading-tight'>
                          <span className='block font-semibold text-emerald-300'>
                            {bonus.value}
                          </span>
                          {bonus.remaining !== null && (
                            <span className='block text-2xs text-subtle'>
                              {short(bonus.remaining)}s left
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}

          {/* Every block up now, by lane, as the team inspector's queue. */}
          <Card
            focus={focusOf('blocks', 'Active Effects')}
            hidden={hiddenBy('blocks')}
            title={
              <DisclosureButton open={openLanes} onOpenChange={setOpenLanes}>
                Active Effects ({upNow})
                <SectionHelp section='activeEffects' />
              </DisclosureButton>
            }
          >
            {openLanes && (
              <div
                data-testid='timeline-event-blocks'
                className='flex flex-col gap-2'
              >
                {members.length > 1 && (
                  <EffectsFilter
                    members={members}
                    value={shownGiver}
                    onChange={setEffectsOf}
                  />
                )}
                {LANES.map((lane) => {
                  const chips = shownChips.filter(
                    (chip) => laneOf(chip) === lane.id
                  );
                  if (chips.length === 0) {
                    return null;
                  }
                  return (
                    <div key={lane.id}>
                      <SectionLabel className='mb-0.5 flex items-center gap-1'>
                        {lane.title} (
                        {chips.filter((chip) => !exiting.has(chip.key)).length}
                        )
                        <SectionHelp section={lane.help} />
                      </SectionLabel>
                      <ul className='flex flex-col gap-0.5'>
                        {chips.map((chip) => {
                          const giver = memberOf(chip.characterId);
                          return (
                            <EffectRow
                              key={chip.key}
                              chip={chip}
                              quantum={
                                playing ? PLAYING_QUANTUM : PANEL_QUANTUM
                              }
                              frozenAt={frozenAt}
                              giver={giver}
                              leaving={exiting.has(chip.key)}
                              hovered={chip.key === hoveredChip}
                              held={
                                action !== undefined &&
                                chip.cause === action.causeId
                              }
                              pulseKey={spanAt(chip, time).start}
                              coordinated={coordinatedText(
                                coordinated.get(
                                  `${chip.characterId}|${chip.blockId}`
                                ),
                                time
                              )}
                              holderName={
                                chip.holder && chip.holder !== chip.characterId
                                  ? memberOf(chip.holder)?.name ?? chip.holder
                                  : null
                              }
                              healedName={
                                chip.healed
                                  ? memberOf(chip.healed)?.name ?? chip.healed
                                  : null
                              }
                            />
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {shownChips.length === 0 && (
                  <EmptyState className='py-2 text-2xs'>
                    {shownGiver === 'all'
                      ? 'Nothing up at this moment.'
                      : `Nothing from ${
                          memberOf(shownGiver)?.name ?? shownGiver
                        } at this moment.`}
                  </EmptyState>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </Panel>
  );
};

// It follows the playhead at most every PANEL_QUANTUM.
export default memo(EventPanel, samePanelProps);
