import {
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Sparkle,
  Users,
} from 'lucide-react';
import {
  Children,
  ComponentProps,
  forwardRef,
  memo,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisclosureButton } from '@/components/ui/disclosure';
import { EmptyState } from '@/components/ui/empty-state';
import { Meter, SegmentedMeter } from '@/components/ui/meter';
import { Inset, Panel } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import { StatList, StatRow } from '@/components/ui/stat-row';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import PanelTitle from './PanelTitle';
import PanelToggle from './PanelToggle';
import SectionHelp from './SectionHelp';
import { SectionHelpKey } from './sectionHelp';
import { ELEMENT_TEXT } from './sourceStyles';
import StatIcon from './StatIcon';
import { TimelineMember } from './TimelineChart';
import {
  actionAt,
  actionTitle,
  changesSpecialSystem,
  displayAction,
  eventCharacterState,
  EventPin,
  hitsOfAction,
  isSystemResource,
  meterAt,
  pinOf,
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
import { elementIconUrl, monsterIconUrl } from '../../_lib/genshinIcons';
import {
  ActionPiece,
  auraAt,
  BlockChip,
  BlockType,
  coordinatedUntil,
  EnemyHit,
  getHitFormula,
  INSPECTOR_ENEMY,
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

const ElementIcon = ({ element, size }: { element: string; size: number }) => {
  const src = elementIconUrl(element);
  // A glyph on its own: no tile behind it.
  return src ? (
    <Avatar
      src={src}
      alt={element}
      size={size}
      shape='square'
      className='bg-transparent'
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
  hidden = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  focus?: { label: string; active: boolean; onToggle: () => void };
  hidden?: boolean;
}) =>
  hidden ? null : (
    <Inset
      className={cn(
        'relative',
        focus && 'pr-8',
        focus?.active && 'border-brand-500/40',
        className
      )}
    >
      {focus && (
        <Button
          variant='ghost'
          size='icon-xs'
          aria-pressed={focus.active}
          aria-label={
            focus.active ? 'Show every section' : `Focus on ${focus.label}`
          }
          title={focus.active ? 'Show every section' : 'Focus on this section'}
          onClick={focus.onToggle}
          className='absolute top-2 right-2 size-5 rounded text-subtle'
        >
          {focus.active ? (
            <Minimize2 className='size-3' />
          ) : (
            <Maximize2 className='size-3' />
          )}
        </Button>
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
// tooltip.
const BlockMeter = ({
  chip,
  time,
  barClass,
}: {
  chip: BlockChip;
  time: number;
  barClass: string;
}) => {
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
// lit softly (made by the event shown). Its ref and props go through, as
// a tooltip's trigger.
const PulseRow = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & { pulseKey: number; held: boolean }
>(function PulseRow({ pulseKey, held, className, ...props }, ref) {
  const [lit, setLit] = useState(true);
  useEffect(() => {
    setLit(true);
    // Lit for a moment, then the transition fades it.
    const timer = window.setTimeout(() => setLit(false), 30);
    return () => window.clearTimeout(timer);
  }, [pulseKey]);
  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        className,
        lit
          ? 'bg-brand-400/35 transition-none'
          : 'transition-colors duration-1000 ease-out',
        held && !lit && 'bg-brand-500/15'
      )}
    />
  );
});

// One line of the owner's state, always there (a dash when it has nothing
// to show), so the panel never jumps: its value out of the max as a bar,
// and what the event changed.
const StateLine = ({
  row,
  placeholder,
  bar,
}: {
  row: StateRow | null;
  placeholder: string;
  bar: string;
}) => {
  const unit = row?.format === 'percent' ? '%' : '';
  const value = row?.value ?? null;
  const changed =
    value !== null &&
    row?.before !== null &&
    row?.before !== undefined &&
    Math.abs(row.before - value) > 1e-6;
  return (
    <div className='flex h-[30px] items-center gap-2'>
      {row?.iconUrl ? (
        <Avatar src={row.iconUrl} size={18} className='bg-transparent' />
      ) : (
        <Sparkle className='size-[18px] shrink-0 text-subtle/60' />
      )}
      <span className='min-w-0 flex-1 leading-tight'>
        <span className='flex items-center gap-1'>
          <span
            className={cn(
              'truncate',
              row ? 'text-muted-foreground' : 'text-subtle'
            )}
          >
            {row?.label ?? placeholder}
          </span>
          <span className='ml-auto shrink-0 text-2xs text-subtle tabular-nums'>
            {changed
              ? `${short(row?.before ?? 0)}${unit} → ${short(value)}${unit}`
              : row?.remaining
              ? `${short(row.remaining)}s left`
              : ''}
          </span>
        </span>
        <Meter
          value={value ?? 0}
          max={row?.max ?? 0}
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
            {row?.max !== null && row?.max !== undefined && (
              <span className='font-normal text-subtle'>/{short(row.max)}</span>
            )}
            {unit}
          </>
        )}
      </span>
    </div>
  );
};

// The owner's state: its E and Q (the Q with its Energy) and its weapon's
// stacks; always the same lines. Its mechanic has a card of its own.
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
          'block truncate',
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
        <span className='block truncate text-2xs text-subtle tabular-nums'>
          {button.cooldown.charges > 1
            ? `${button.cooldown.ready}/${button.cooldown.charges} charges`
            : button.cooldown.remaining > 0
            ? `${short(button.cooldown.remaining)}s`
            : 'ready'}
        </span>
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
    <StateLine row={state.weapon} placeholder='Weapon' bar={ownerBar} />
  </div>
);

type FocusId =
  | 'state'
  | 'mechanic'
  | 'target'
  | 'hits'
  | 'formula'
  | 'bonuses'
  | 'blocks';

type EventPanelProps = {
  view: InspectorView;
  run: TeamRun;
  members: TimelineMember[];
  actionsById: Map<string, RotationAction>;
  time: number;
  // The run is playing: it follows the playhead less often (see
  // samePanelProps).
  playing?: boolean;
  enemyLevel: number;
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
// what it did, top to bottom: who, its hits, the target, the DMG formula
// of one hit, the bonuses on it, and every block up at that moment, in
// the team inspector's lanes (a queue: blocks join at the end, stay in
// place and fold out when over).
const EventPanel = ({
  view,
  run,
  members,
  actionsById,
  time,
  enemyLevel,
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
  const resolvedPin = pinned ? resolvePin(view, pinned) : null;
  const resolved = shownEvent(view, pinned, pickedBlock);
  // Its block is gone (removed, another scenario): back to the playhead.
  useEffect(() => {
    if (pinned && !resolvePin(view, pinned)) {
      setPinned(null);
    }
  }, [view, pinned]);
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
  const [openFormula, setOpenFormula] = useState(false);
  const [openBonuses, setOpenBonuses] = useState(false);
  const [openHits, setOpenHits] = useState(false);
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
  // The event: the ability a character used at the playhead (the action
  // playing, else the latest started). Its hits are known from the moment
  // it is used, even those that land seconds later (Iansan's E, a
  // grenade): each shows when it lands.
  const atCursor = actionAt(view.actions, time);
  const action: ActionPiece | undefined = resolved ? resolved.action : atCursor;
  const hits = useMemo(
    () => (action ? hitsOfAction(view, action) : []),
    [view, action]
  );
  const landed = hits.filter((hit) => hit.time <= now);
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
  // The hit's stats against the character screen's (the build's totals).
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
      label: string,
      field: string | null,
      value: number | null,
      base: number,
      suffix = ''
    ) => {
      const delta = value === null ? 0 : value - base;
      return {
        label,
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
    const entry = logEntry ?? null;
    const ownBonus =
      (entry && character && entry.element === character.element
        ? read('elementalBonus')
        : 0) + read('bonus');
    return [
      row(
        STAT_LABELS[scaling] ?? scaling,
        scaling,
        entry?.stat ?? null,
        read(scaling)
      ),
      row(
        'CRIT Rate',
        'cr',
        entry ? entry.critRate * 100 : null,
        read('cr'),
        '%'
      ),
      row(
        'CRIT DMG',
        'cd',
        entry?.critDamage !== undefined ? entry.critDamage * 100 : null,
        read('cd'),
        '%'
      ),
      row('DMG Bonus', null, entry ? entry.totalBonus : null, ownBonus, '%'),
    ];
  }, [builds, ownerId, character, logEntry]);
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
  const aura = auraAt(view.auras, time);
  // The owner's state at the playhead (cooldowns run down as it moves,
  // a pinned event too), with what the event changed since it was used.
  const ownerRun = run.members.find((entry) => entry.characterId === ownerId);
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
        <PanelTitle section='event'>Selected Event</PanelTitle>
        <span className='text-2xs text-subtle'>
          {resolvedPin
            ? 'pinned'
            : resolved
            ? 'selected block'
            : 'follows the playhead'}
        </span>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-pressed={resolvedPin !== null}
          aria-label={resolvedPin ? 'Unpin' : 'Pin'}
          title={resolvedPin ? 'Unpin' : 'Pin this event'}
          disabled={!action}
          onClick={() =>
            setPinned((current) =>
              current || !action ? null : pinOf(view, action, hit)
            )
          }
          className='ml-auto text-subtle'
        >
          {resolvedPin ? <PinOff /> : <Pin />}
        </Button>
        <PanelToggle label='event' collapsed={collapsed} onToggle={onToggle} />
      </div>

      {!collapsed && (
        <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5 text-xs'>
          {!action || !owner || !character ? (
            <EmptyState>
              Nothing played yet: play or move the playhead.
            </EmptyState>
          ) : (
            <>
              {/* Who, what, when, how much. */}
              <Card hidden={hiddenBy('header')}>
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
                      <span className='ml-auto text-2xs whitespace-nowrap text-subtle tabular-nums'>
                        used at{' '}
                        <span className='font-mono text-muted-foreground'>
                          {action.start.toFixed(3)} s
                        </span>
                      </span>
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
                <div className='mt-2 flex items-center gap-2'>
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
                  {hit?.isCrit && !upcoming && (
                    <Badge
                      variant='warning'
                      size='sm'
                      className='ml-auto font-semibold text-amber-300'
                    >
                      <Sparkle className='size-3' />
                      Critical Hit
                    </Badge>
                  )}
                </div>
                {/* The stats of the hit shown (every buff of that moment
                    in), and what they gain over the character screen.
                    Always there, so nothing moves. */}
                <StatList
                  data-testid='timeline-event-stats'
                  className='mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-muted pt-2'
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
                      label={row.label}
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

              {ownerState && (
                <Card
                  title={
                    <>
                      Character state
                      <SectionHelp section='characterState' />
                    </>
                  }
                  focus={focusOf('state', 'Character state')}
                  hidden={hiddenBy('state')}
                >
                  <CharacterStateRows
                    state={ownerState}
                    ownerBar={owner.color.bar}
                    element={character.element}
                  />
                </Card>
              )}

              {/* Only for those with one: Nightsoul points or Bond of
                  Life. */}
              {ownerState?.mechanic && (
                <Card
                  title={
                    <>
                      Special mechanic
                      <SectionHelp section='specialMechanic' />
                    </>
                  }
                  focus={focusOf('mechanic', 'Special mechanic')}
                  hidden={hiddenBy('mechanic')}
                >
                  <div
                    data-testid='timeline-event-mechanic'
                    className='text-2xs'
                  >
                    <StateLine
                      row={ownerState.mechanic}
                      placeholder=''
                      bar={
                        ownerState.mechanic.id === 'bondOfLife'
                          ? 'bg-rose-500'
                          : 'bg-fuchsia-500'
                      }
                    />
                  </div>
                </Card>
              )}

              <Card
                title={
                  <>
                    Target
                    <SectionHelp section='target' />
                  </>
                }
                focus={focusOf('target', 'Target')}
                hidden={hiddenBy('target')}
              >
                <div className='flex items-center gap-2'>
                  <Avatar
                    src={monsterIconUrl(INSPECTOR_ENEMY.icon)}
                    size={32}
                  />
                  <div className='text-2xs leading-tight'>
                    <p className='text-muted-foreground'>
                      {INSPECTOR_ENEMY.name} (Lv. {enemyLevel})
                    </p>
                    <p className='flex items-center gap-1 text-subtle'>
                      {aura ? (
                        <>
                          <ElementIcon element={aura.element} size={12} />
                          {aura.element} aura · {short(aura.gauge)} U
                        </>
                      ) : (
                        'No aura'
                      )}
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                focus={focusOf('hits', 'Hit Details')}
                hidden={hiddenBy('hits')}
                title={
                  <DisclosureButton open={openHits} onOpenChange={setOpenHits}>
                    Hit Details
                    <SectionHelp section='hits' />
                    {!openHits && (
                      <span className='ml-auto text-2xs font-normal text-subtle tabular-nums'>
                        {landed.length}/{hits.length} landed
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
                    {hits.length > 0 && (
                      <ul className='mt-2 flex flex-col gap-0.5'>
                        {hits.map((entry) => {
                          const key = hitKey(entry);
                          return (
                            <li key={key}>
                              <button
                                type='button'
                                onClick={() => {
                                  setPinned(pinOf(view, action, entry));
                                  onSeek?.(entry.time);
                                }}
                                className={cn(
                                  'flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-2xs hover:bg-muted',
                                  hit &&
                                    key === hitKey(hit) &&
                                    'bg-brand-600/20'
                                )}
                              >
                                <ElementIcon
                                  element={entry.element}
                                  size={12}
                                />
                                <span
                                  className={cn(
                                    'truncate',
                                    entry.time > now
                                      ? 'text-subtle'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {entry.label}
                                </span>
                                {/* When it lands: a countdown until then
                                    (no taller than the row's text, so the
                                    row keeps its height as it lands). */}
                                {entry.time > now ? (
                                  <Badge
                                    variant='brand'
                                    size='xs'
                                    className='text-2xs leading-none font-normal text-brand-300 tabular-nums'
                                  >
                                    lands {seconds(entry.time)} · in{' '}
                                    {short(entry.time - time)}s
                                  </Badge>
                                ) : (
                                  <span className='shrink-0 text-2xs text-emerald-400/90 tabular-nums'>
                                    ✓ {seconds(entry.time)}
                                  </span>
                                )}
                                {entry.isCrit && entry.time <= now && (
                                  <Badge
                                    variant='warning'
                                    size='xs'
                                    className='font-bold text-amber-300'
                                  >
                                    CRIT
                                  </Badge>
                                )}
                                <span
                                  className={cn(
                                    'ml-auto shrink-0 font-semibold tabular-nums',
                                    entry.time > now
                                      ? 'text-subtle'
                                      : 'text-foreground'
                                  )}
                                >
                                  {formatNumber(Math.round(entry.damage))}
                                </span>
                              </button>
                            </li>
                          );
                        })}
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
                          <Avatar
                            src={bonus.iconUrl}
                            size={18}
                            className='bg-transparent'
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
                {LANES.map((lane) => {
                  const chips = queued.filter(
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
                          const leaving = exiting.has(chip.key);
                          const giver = memberOf(chip.characterId);
                          // The giver's own color: purple, Iansan's.
                          const giverBar = giver?.color.bar ?? 'bg-slate-400';
                          return (
                            <li
                              key={chip.key}
                              className={cn(
                                'grid transition-all duration-300 ease-out',
                                leaving
                                  ? 'grid-rows-[0fr] opacity-0'
                                  : 'grid-rows-[1fr] animate-in duration-300 fade-in-0 slide-in-from-bottom-1'
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <PulseRow
                                    data-hovered={
                                      chip.key === hoveredChip || undefined
                                    }
                                    // It pulses when it joins, and again
                                    // when renewed (a new application).
                                    pulseKey={spanAt(chip, time).start}
                                    // Made by the event shown: it stays lit.
                                    held={
                                      !leaving &&
                                      action !== undefined &&
                                      chip.cause === action.causeId
                                    }
                                    className={cn(
                                      'flex min-h-0 items-center gap-2 overflow-hidden rounded-md px-1.5 hover:bg-muted/60',
                                      // Folding out, it gives its room back.
                                      leaving ? 'py-0' : 'py-0.5',
                                      // Its bar is hovered on the chart:
                                      // stronger than the event's own.
                                      chip.key === hoveredChip &&
                                        '!bg-amber-400/30 ring-1 ring-amber-300/80'
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'h-4 w-0.5 shrink-0 rounded-full',
                                        giverBar
                                      )}
                                    />
                                    {chip.iconUrl ? (
                                      <Avatar
                                        src={chip.iconUrl}
                                        size={18}
                                        shape='square'
                                        className='bg-transparent'
                                      />
                                    ) : (
                                      <Sparkle className='size-[18px] shrink-0 text-subtle' />
                                    )}
                                    <span className='min-w-0 flex-1 leading-tight'>
                                      <span className='block truncate text-2xs text-muted-foreground'>
                                        {chip.label}
                                      </span>
                                      <span className='flex items-center gap-1 truncate text-2xs text-subtle'>
                                        {giver?.name ?? chip.characterId} ·{' '}
                                        {chip.sourceTag}
                                        {chip.type === 'heal' &&
                                          !chip.healed && (
                                            <Users className='size-3' />
                                          )}
                                      </span>
                                    </span>
                                    {/* A long value (Masque's) is cut;
                                        the tooltip has it whole. */}
                                    <span className='max-w-[45%] min-w-0 shrink-0 text-right text-2xs leading-tight tabular-nums'>
                                      {(chip.value ?? chip.short) && (
                                        <span className='block truncate font-semibold text-emerald-300'>
                                          {chip.value ?? chip.short}
                                        </span>
                                      )}
                                      {(() => {
                                        // A coordinated attack: what it
                                        // dealt so far, and its next hit.
                                        const source = coordinated.get(
                                          `${chip.characterId}|${chip.blockId}`
                                        );
                                        if (
                                          !source ||
                                          source.hits +
                                            (source.nextAt === null ? 0 : 1) ===
                                            0
                                        ) {
                                          return null;
                                        }
                                        return (
                                          <span
                                            data-testid='timeline-coordinated-total'
                                            className='block truncate text-2xs text-brand-200'
                                          >
                                            {source.hits} hits ·{' '}
                                            {formatNumber(
                                              Math.round(source.damage)
                                            )}
                                            {source.nextAt !== null &&
                                              ` · next ${formatNumber(
                                                Math.round(
                                                  (source.nextAt - time) * 10
                                                ) / 10
                                              )} s`}
                                          </span>
                                        );
                                      })()}
                                      <span className='mt-1 flex justify-end'>
                                        <BlockMeter
                                          chip={chip}
                                          time={time}
                                          barClass={giverBar}
                                        />
                                      </span>
                                    </span>
                                  </PulseRow>
                                </TooltipTrigger>
                                <TooltipContent side='left' variant='card'>
                                  <BlockTipCard
                                    chip={chip}
                                    time={time}
                                    owner={giver ?? null}
                                    holderName={
                                      chip.holder &&
                                      chip.holder !== chip.characterId
                                        ? memberOf(chip.holder)?.name ??
                                          chip.holder
                                        : null
                                    }
                                    healedName={
                                      chip.healed
                                        ? memberOf(chip.healed)?.name ??
                                          chip.healed
                                        : null
                                    }
                                    accentClass={giverBar}
                                  />
                                </TooltipContent>
                              </Tooltip>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {queued.length === 0 && (
                  <EmptyState className='py-2 text-2xs'>
                    Nothing up at this moment.
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
