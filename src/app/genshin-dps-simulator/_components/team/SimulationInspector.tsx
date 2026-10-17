import {
  CircleDot,
  Dices,
  HeartCrack,
  HeartPulse,
  LucideIcon,
  Moon,
  Pause,
  Pin,
  PinOff,
  Play,
  ShieldOff,
  SkipBack,
  SkipForward,
  Sparkles,
  Swords,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Fragment,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import CharacterAvatar from '../CharacterAvatar';
import RotationActionIcon from '../rotation/RotationActionIcon';
import { getLoadedCharacter } from '../../_lib/characterData';
import formatNumber from '../../_lib/formatNumber';
import {
  elementIconUrl,
  iconUrl,
  monsterIconUrl,
} from '../../_lib/genshinIcons';
import {
  ActionPiece,
  auraAt,
  BlockChip,
  BlockType,
  buildInspectorView,
  damageUntil,
  EnemyHit,
  getHitFormula,
  INSPECTOR_ENEMY,
  InspectorView,
  reactionsUntil,
  spanAt,
  timerEnd,
} from '../../_lib/inspector';
import { readNumber } from '../../_lib/readValue';
import { KIND_STYLES } from '../../_lib/rotation/kindStyles';
import { getMemberStyle } from '../../_lib/rotation/memberStyles';
import { parseValues } from '../../_lib/simulationValues';
import {
  getHitBonuses,
  getTeamActions,
  runInspectorTest,
  STAT_LABELS,
  TeamRun,
} from '../../_lib/team';
import { SimulationValues } from '../../_lib/types';
import { getWeaponRefinement } from '../../_lib/weapons';

const SPEEDS = [0.5, 1, 2, 4];
// The rotation ruler: pixels per second, its tick row and a piece's width.
const RULER_PX = 40;
const RULER_HEIGHT = 14;
const PIECE_ROW_PX = 84;
// The narrowest an action can be drawn, and the gap between two.
const MIN_PIECE_PX = 60;
const PIECE_GAP_PX = 2;
// How long an instant block (a trigger firing) stays in the queue.
const INSTANT_SECONDS = 2;
// How long a block takes to leave the queue (fade and fold).
const EXIT_MS = 300;

const seconds = (value: number) =>
  `${formatNumber(Math.round(value * 100) / 100)} s`;

const nameOf = (characterId: string) =>
  getLoadedCharacter(characterId).character.name;

const avatarOf = (characterId: string) =>
  iconUrl(getLoadedCharacter(characterId).character.icons.avatar);

type QueuePieceProps = {
  characterId: string;
  colorClass: string;
  stripeClass: string;
  icon: ReactNode;
  keyLabel: string;
  footer: string;
  title: string;
  dimmed?: boolean;
  highlighted?: boolean;
  'data-testid'?: string;
  'data-chip-key'?: string;
  // Pixels wide (the rotation ruler: as long as the action lasted).
  width?: number;
};

// One block, drawn like a rotation piece: avatar, icon, key, time.
const QueuePiece = ({
  characterId,
  colorClass,
  stripeClass,
  icon,
  keyLabel,
  footer,
  title,
  dimmed = false,
  highlighted = false,
  'data-testid': testId,
  'data-chip-key': chipKey,
  width,
}: QueuePieceProps) => (
  <div
    data-testid={testId}
    data-chip-key={chipKey}
    title={title}
    style={width === undefined ? undefined : { width }}
    className={cn(
      'relative flex h-20 shrink-0 flex-col justify-between overflow-hidden rounded border px-1 py-1 pb-1.5',
      width === undefined && 'w-20',
      colorClass,
      dimmed && 'opacity-40',
      highlighted && 'ring-2 ring-primary'
    )}
  >
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-[3px]',
        stripeClass
      )}
    />
    <span className='flex flex-col items-start gap-0.5'>
      <CharacterAvatar
        src={avatarOf(characterId)}
        alt={nameOf(characterId)}
        size={20}
      />
      {icon}
    </span>
    <kbd className='truncate rounded-[3px] border border-current/40 bg-background/60 px-1 font-sans text-[10px] leading-3 font-bold'>
      {keyLabel}
    </kbd>
    <span className='truncate text-[9px] leading-3 text-muted-foreground tabular-nums'>
      {footer}
    </span>
  </div>
);

const BlockIcon = ({ src }: { src: string | null }) =>
  src ? (
    <span className='inline-flex size-5 items-center justify-center rounded-full bg-zinc-800 p-0.5 ring-1 ring-white/10'>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt='' width={16} height={16} />
    </span>
  ) : (
    <span className='size-5' />
  );

// What each type of block looks like: its color, icon and name.
const TYPE_STYLES: Record<
  BlockType,
  { box: string; bar: string; track: string; icon: LucideIcon; title: string }
> = {
  bonus: {
    box: 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
    track: 'bg-violet-500/20',
    icon: TrendingUp,
    title: 'Bonus',
  },
  debuff: {
    box: 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    track: 'bg-rose-500/20',
    icon: ShieldOff,
    title: 'Debuff',
  },
  extraHit: {
    box: 'border-orange-500/60 bg-orange-500/15 text-orange-700 dark:text-orange-300',
    bar: 'bg-orange-500',
    track: 'bg-orange-500/20',
    icon: Swords,
    title: 'Extra hit',
  },
  heal: {
    box: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    track: 'bg-emerald-500/20',
    icon: HeartPulse,
    title: 'Healing',
  },
  energy: {
    box: 'border-sky-500/60 bg-sky-500/15 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
    track: 'bg-sky-500/20',
    icon: Sparkles,
    title: 'Energy',
  },
  cooldown: {
    box: 'border-zinc-500/50 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
    bar: 'bg-zinc-400',
    track: 'bg-zinc-500/20',
    icon: Timer,
    title: 'Cooldown',
  },
  nightsoul: {
    box: 'border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
    bar: 'bg-fuchsia-500',
    track: 'bg-fuchsia-500/20',
    icon: Moon,
    title: 'Nightsoul',
  },
  bondOfLife: {
    box: 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    track: 'bg-rose-500/20',
    icon: HeartCrack,
    title: 'Bond of Life',
  },
  state: {
    box: 'border-slate-500/50 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    bar: 'bg-slate-400',
    track: 'bg-slate-500/20',
    icon: CircleDot,
    title: 'State',
  },
};

const short = (value: number) => formatNumber(Math.round(value * 10) / 10);

// Time left of a span, as a bar that empties, and its text.
const TimerBar = ({
  start,
  end,
  time,
  type,
  text,
}: {
  start: number;
  end: number;
  time: number;
  type: BlockType;
  text: string;
}) => {
  const total = end - start;
  const left = Math.max(0, end - time);
  return (
    <span className='flex items-center gap-1 text-[9px] leading-3 tabular-nums'>
      <span
        className={cn(
          'relative h-1.5 flex-1 overflow-hidden rounded-full',
          TYPE_STYLES[type].track
        )}
      >
        <span
          className={cn('absolute inset-y-0 left-0', TYPE_STYLES[type].bar)}
          style={{ width: `${total > 0 ? (left / total) * 100 : 0}%` }}
        />
      </span>
      {text}
    </span>
  );
};

type TypedPieceProps = {
  chip: BlockChip;
  width: string;
  children: ReactNode;
  // Rows of the tooltip, under its title and effect.
  details: [string, string][];
};

// Every block: titled by what it does (Bonus, Extra hit, Healing…), with
// where it comes from as a tag (E, C2, A4, Weapon…), its body, and the
// rest on hover.
// The tooltip is only mounted while the block is hovered: dozens of idle
// tooltips made every cursor move slow.
const TypedPiece = ({ chip, width, children }: TypedPieceProps) => {
  const style = TYPE_STYLES[chip.type];
  const Icon = style.icon;
  const [hovered, setHovered] = useState(false);
  const piece = (
    <div
      onPointerEnter={() => setHovered(true)}
      data-testid='inspector-chip'
      data-chip-key={chip.key}
      data-chip-type={chip.type}
      aria-label={`${style.title} · ${chip.sourceTag} · ${chip.label}`}
      className={cn(
        'relative flex h-20 shrink-0 cursor-help flex-col justify-between overflow-hidden rounded border px-1.5 py-1 pb-1.5',
        style.box,
        width
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-[3px]',
          style.bar
        )}
      />
      <span className='flex items-center gap-1'>
        <Icon className='size-3.5 shrink-0' />
        <span className='text-[11px] font-bold whitespace-nowrap'>
          {style.title}
        </span>
        <span className='ml-auto rounded bg-current/15 px-1 text-[9px] font-bold whitespace-nowrap'>
          {chip.sourceTag}
        </span>
      </span>
      {children}
    </div>
  );
  if (!hovered) {
    return piece;
  }
  return (
    <Tooltip open onOpenChange={(open) => setHovered(open)}>
      <TooltipTrigger asChild onPointerLeave={() => setHovered(false)}>
        {piece}
      </TooltipTrigger>
      <TooltipContent side='top' collisionPadding={8}>
        {/* Only the in-game text of where it comes from, word for word. */}
        <div className='max-w-80 text-left text-xs'>
          <p className='font-semibold'>
            {chip.sourceTag} · {chip.sourceName ?? chip.label}
          </p>
          <p className='mt-1 whitespace-pre-line'>
            {chip.sourceText ?? chip.effect ?? chip.label}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

// A plain image: blocks redraw as the cursor moves, so it stays light.
const Owner = ({ characterId }: { characterId: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={avatarOf(characterId)}
    alt={nameOf(characterId)}
    width={18}
    height={18}
    className='size-[18px] shrink-0 rounded-full bg-linear-to-br from-amber-700 to-orange-400 ring-1 ring-amber-300/30'
  />
);

const Value = ({ children }: { children: ReactNode }) => (
  <kbd className='truncate rounded-[3px] border border-current/40 bg-background/60 px-1 font-sans text-[10px] leading-3 font-bold'>
    {children}
  </kbd>
);

// A block's body, by what it does.
// Blocks show times to a tenth of a second: they redraw only when that
// changes (or the block itself does).
const QUANTUM = 0.05;
const ChipPiece = memo(
  function ChipPiece({ chip, time }: { chip: BlockChip; time: number }) {
    return <ChipBody chip={chip} time={time} />;
  },
  (before, after) =>
    before.chip === after.chip &&
    Math.round(before.time / QUANTUM) === Math.round(after.time / QUANTUM)
);

const ChipBody = ({ chip, time }: { chip: BlockChip; time: number }) => {
  const span =
    chip.end !== null ? `${seconds(chip.start)} → ${seconds(chip.end)}` : '';

  if (chip.type === 'heal') {
    const ticks = chip.ticks ?? [];
    const overTime = ticks.length > 1 && chip.end !== null;
    const done = ticks.filter((tick) => tick <= time + 1e-6).length;
    const next = ticks.find((tick) => tick > time + 1e-6);
    return (
      <TypedPiece
        chip={chip}
        width='w-44'
        details={[
          [
            'Heals',
            chip.healed
              ? `${nameOf(chip.healed)} (on the field)`
              : 'The whole party',
          ],
          [
            overTime ? 'Lasts' : 'At',
            overTime ? `${span} · ${ticks.length} heals` : seconds(chip.start),
          ],
          ['Note', 'HP is not simulated'],
        ]}
      >
        <span className='flex items-center gap-1'>
          <Owner characterId={chip.characterId} />
          <span aria-hidden className='text-[10px]'>
            →
          </span>
          {chip.healed ? (
            <Owner characterId={chip.healed} />
          ) : (
            <Users className='size-4' aria-label='Whole party' />
          )}
          <Value>{chip.short ?? chip.effect}</Value>
        </span>
        {overTime ? (
          <TimerBar
            start={chip.start}
            end={chip.end ?? chip.start}
            time={time}
            type='heal'
            text={`${done}/${ticks.length} · ${
              next !== undefined ? `next ${short(next - time)} s` : 'done'
            }`}
          />
        ) : (
          <span className='text-[9px] leading-3'>at {seconds(chip.start)}</span>
        )}
      </TypedPiece>
    );
  }

  if (chip.type === 'bondOfLife') {
    const value =
      [...(chip.points ?? [])].reverse().find((entry) => entry.time <= time)
        ?.value ?? 0;
    const max = chip.max ?? 0;
    return (
      <TypedPiece chip={chip} width='w-48' details={[]}>
        <span className='flex items-center gap-1'>
          <Owner characterId={chip.characterId} />
          <span className='truncate text-[10px] font-semibold'>
            {short(value)}% of Max HP
          </span>
        </span>
        <span className='flex items-center gap-1 text-[10px] leading-3 font-bold tabular-nums'>
          <span className='relative h-2 flex-1 overflow-hidden rounded-full bg-rose-500/20'>
            <span
              className='absolute inset-y-0 left-0 bg-rose-500'
              style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
            />
          </span>
          {short(value)}/{max}%
        </span>
        <span className='text-[9px] leading-3'>
          since {seconds(chip.start)}
        </span>
      </TypedPiece>
    );
  }

  if (chip.type === 'nightsoul') {
    const points =
      [...(chip.points ?? [])].reverse().find((entry) => entry.time <= time)
        ?.value ?? 0;
    const max = chip.max ?? 0;
    const burst = (chip.bursts ?? []).find(
      (at) => at <= time && time - at < INSTANT_SECONDS
    );
    return (
      <TypedPiece chip={chip} width='w-52' details={[]}>
        <span className='flex items-center gap-1'>
          <Owner characterId={chip.characterId} />
          <BlockIcon src={chip.iconUrl} />
          <span className='truncate text-[10px] font-semibold'>
            Blessing · {short(time - chip.start)} s
          </span>
          {burst !== undefined && (
            <span className='ml-auto rounded bg-fuchsia-500/30 px-1 text-[9px] font-bold whitespace-nowrap'>
              ✦ Burst
            </span>
          )}
        </span>
        {/* Nightsoul points now, out of the max. */}
        <span className='flex items-center gap-1 text-[10px] leading-3 font-bold tabular-nums'>
          <span className='relative h-2 flex-1 overflow-hidden rounded-full bg-fuchsia-500/20'>
            <span
              className='absolute inset-y-0 left-0 bg-fuchsia-500'
              style={{ width: `${max > 0 ? (points / max) * 100 : 0}%` }}
            />
          </span>
          {short(points)}/{max}
        </span>
        <span className='text-[9px] leading-3 tabular-nums'>
          {chip.end !== null
            ? `Blessing ends in ${short(chip.end - time)} s`
            : 'Blessing'}
        </span>
      </TypedPiece>
    );
  }

  if (chip.parts) {
    // An artifact set: each of its bonuses, with its time left.
    const parts = chip.parts.filter((part) => part.start <= time + 1e-6);
    return (
      <TypedPiece chip={chip} width='w-56' details={[]}>
        <span className='flex items-center gap-1'>
          <Owner characterId={chip.characterId} />
          <BlockIcon src={chip.iconUrl} />
          <span className='truncate text-[10px] font-semibold'>
            {chip.label}
          </span>
        </span>
        <span className='flex flex-col gap-0.5'>
          {parts.map((part) => {
            const now = spanAt(part, time);
            const up = now.end === null || time < now.end;
            const runsOut = timerEnd(now);
            return (
              <span
                key={`${part.label}@${part.start}`}
                className={cn(
                  'flex items-center gap-1 text-[9px] leading-3 tabular-nums',
                  !up && 'opacity-40'
                )}
                title={part.label}
              >
                <span className='w-20 shrink-0 truncate font-bold'>
                  {part.value}
                </span>
                {runsOut !== null ? (
                  <>
                    <span
                      className={cn(
                        'relative h-1 flex-1 overflow-hidden rounded-full',
                        TYPE_STYLES[chip.type].track
                      )}
                    >
                      <span
                        className={cn(
                          'absolute inset-y-0 left-0',
                          TYPE_STYLES[chip.type].bar
                        )}
                        style={{
                          width: `${
                            Math.max(
                              0,
                              (runsOut - time) / (runsOut - now.start)
                            ) * 100
                          }%`,
                        }}
                      />
                    </span>
                    {up ? `${short(runsOut - time)} s` : 'over'}
                  </>
                ) : (
                  <span className='flex-1'>while it holds</span>
                )}
              </span>
            );
          })}
        </span>
      </TypedPiece>
    );
  }

  if (chip.stacks) {
    const max = chip.max ?? 1;
    const stacks = chip.stacks.filter((stack) => stack.start <= time);
    const up = stacks
      .filter((stack) => time < stack.end)
      .sort((a, b) => b.start - a.start);
    const counting = new Set(up.slice(0, max));
    const lastEnd = Math.max(...stacks.map((stack) => stack.end));
    return (
      <TypedPiece
        chip={chip}
        width='min-w-48'
        details={[
          ['Stacks', `${counting.size} of max ${max} count now`],
          ['Each stack', `lasts on its own`],
          ['Held by', nameOf(chip.holder ?? chip.characterId)],
        ]}
      >
        <span className='flex items-center gap-1'>
          <Owner characterId={chip.holder ?? chip.characterId} />
          <BlockIcon src={chip.iconUrl} />
          <Value>
            {chip.value ?? chip.label} × {counting.size}
          </Value>
          <span className='ml-auto text-[10px] font-bold tabular-nums'>
            {counting.size}/{max}
          </span>
        </span>
        {/* A bar per stack still up, emptying with its time left. */}
        <span className='flex h-4 items-end gap-0.5'>
          {up
            .slice()
            .reverse()
            .map((stack, index) => {
              const isCounting = counting.has(stack);
              return (
                <span
                  key={index}
                  title={`${seconds(stack.end - time)} left${
                    isCounting ? '' : ' · over the max, adds nothing'
                  }`}
                  className={cn(
                    'relative h-full w-2 overflow-hidden rounded-sm',
                    TYPE_STYLES[chip.type].track,
                    !isCounting &&
                      'outline outline-1 outline-dashed outline-current/60'
                  )}
                >
                  <span
                    className={cn(
                      'absolute inset-x-0 bottom-0',
                      TYPE_STYLES[chip.type].bar,
                      !isCounting && 'opacity-40'
                    )}
                    style={{
                      height: `${
                        ((stack.end - time) / (stack.end - stack.start)) * 100
                      }%`,
                    }}
                  />
                </span>
              );
            })}
          <span className='ml-auto text-[9px] leading-3 tabular-nums'>
            ends in {short(lastEnd - time)} s
          </span>
        </span>
      </TypedPiece>
    );
  }

  if (chip.type === 'extraHit') {
    const landed = chip.lands !== undefined && time >= chip.lands;
    return (
      <TypedPiece
        chip={chip}
        width='w-44'
        details={[
          ['Hits', chip.hitText ?? ''],
          ['Lands at', seconds(chip.lands ?? chip.start)],
        ]}
      >
        <span className='flex items-center gap-1'>
          <Owner characterId={chip.characterId} />
          <BlockIcon src={chip.iconUrl} />
          <Value>{chip.hitText}</Value>
        </span>
        <span className='text-[9px] leading-3 tabular-nums'>
          {landed || chip.lands === undefined
            ? `landed at ${seconds(chip.lands ?? chip.start)}`
            : `lands in ${short((chip.lands ?? 0) - time)} s`}
        </span>
      </TypedPiece>
    );
  }

  if (chip.type === 'cooldown') {
    const cooldownNow = spanAt(chip, time);
    const cooldownEnd = timerEnd(cooldownNow);
    return (
      <TypedPiece chip={chip} width='w-36' details={[]}>
        <span className='flex items-center gap-1'>
          <BlockIcon src={chip.iconUrl} />
          <span className='truncate text-[10px]'>{chip.label}</span>
        </span>
        {cooldownEnd !== null && (
          <TimerBar
            start={cooldownNow.start}
            end={cooldownEnd}
            time={time}
            type='cooldown'
            text={
              chip.resets
                ? `no cooldown · ${short(cooldownEnd - time)} s left`
                : `ready in ${short(cooldownEnd - time)} s`
            }
          />
        )}
      </TypedPiece>
    );
  }

  // Bonus, debuff, energy and other states: a value and its time left
  // (of the application up now, when it was renewed).
  const now = spanAt(chip, time);
  return (
    <TypedPiece
      chip={chip}
      width='w-44'
      details={chip.end !== null ? [['Lasts', span]] : []}
    >
      <span className='flex items-center gap-1'>
        <Owner characterId={chip.holder ?? chip.characterId} />
        <BlockIcon src={chip.iconUrl} />
        <Value>{chip.value ?? chip.label}</Value>
      </span>
      {timerEnd(now) !== null ? (
        <TimerBar
          start={now.start}
          end={timerEnd(now) ?? now.start}
          time={time}
          type={chip.type}
          text={
            chip.type === 'energy'
              ? `arrive in ${short((timerEnd(now) ?? time) - time)} s`
              : `${short((timerEnd(now) ?? time) - time)} s left`
          }
        />
      ) : (
        <span className='text-[9px] leading-3'>at {seconds(chip.start)}</span>
      )}
    </TypedPiece>
  );
};

// The test enemy, as in-game (Project Amber's Ruin Guard portrait).
const ENEMY = INSPECTOR_ENEMY;

// Element colors of the aura's time bar.
const ELEMENT_BARS: Record<string, string> = {
  Pyro: 'bg-orange-500',
  Electro: 'bg-violet-500',
  Hydro: 'bg-sky-500',
  Cryo: 'bg-cyan-400',
  Dendro: 'bg-lime-500',
};
const ELEMENT_TRACKS: Record<string, string> = {
  Pyro: 'bg-orange-500/20',
  Electro: 'bg-violet-500/20',
  Hydro: 'bg-sky-500/20',
  Cryo: 'bg-cyan-400/20',
  Dendro: 'bg-lime-500/20',
};

// A transformative reaction's own hit (Overloaded's explosion).
const isReactionHit = (hit: EnemyHit) =>
  hit.reaction !== 'None' && hit.category === hit.reaction;

// The two elements that reacted: the aura's and the hit's that met it.
const reactionElements = (view: InspectorView, hit: EnemyHit): string[] => {
  const point = view.auras.find(
    (entry) =>
      entry.reaction === hit.reaction && Math.abs(entry.time - hit.time) < 1e-6
  );
  return point ? [point.element, point.hitElement] : [];
};

type EnemyPanelProps = {
  view: InspectorView;
  time: number;
  current: ActionPiece | undefined;
  hp: number;
  level: number;
  // 'enemy': the enemy card (right column); 'log': the combat log (bottom).
  part: 'enemy' | 'log';
  // The hit shown in "Selected event", and picking another.
  selectedKey?: string | null;
  onSelect?: (hit: EnemyHit) => void;
};

// A hit's id: its member and its place in their log.
const hitKey = (hit: Pick<EnemyHit, 'characterId' | 'index'>) =>
  `${hit.characterId}#${hit.index}`;

// The enemy at the cursor: its HP, its elemental aura, and what the
// action being played has dealt so far.
// Each action's own hits, once per run: from its start until the same
// step's next turn (a loop plays it again). A reaction it caused is a
// history line of its own.
const hitsByAction = (view: InspectorView): Map<string, EnemyHit[]> =>
  new Map(
    view.actions.map((action) => {
      const nextTurn =
        view.actions.find(
          (other) =>
            other.blockUid === action.blockUid && other.start > action.start
        )?.start ?? Number.POSITIVE_INFINITY;
      return [
        action.key,
        view.hits.filter(
          (hit) =>
            !isReactionHit(hit) &&
            hit.blockUid === action.blockUid &&
            hit.time >= action.start - 1e-6 &&
            hit.time < nextTurn
        ),
      ];
    })
  );

// Memoized: it only redraws when its (deferred) time or run changes.
const EnemyPanel = memo(function EnemyPanel({
  view,
  time,
  current,
  hp,
  level,
  part,
  selectedKey = null,
  onSelect,
}: EnemyPanelProps) {
  const actionHits = useMemo(() => hitsByAction(view), [view]);
  const taken = damageUntil(view.hits, time);
  const left = Math.max(0, hp - taken);
  const aura = auraAt(view.auras, time);
  const reactions = reactionsUntil(view.hits, time);
  const reaction = [...view.auras]
    .reverse()
    .find(
      (point) =>
        point.reaction && point.time <= time + 1e-6 && time - point.time < 1
    );
  // A linear history: every action played so far, in order, never
  // dropped, each with its hits so far (later hits, a grenade's shells,
  // keep adding to it): from its start until the same step's next turn (a
  // loop plays it again).
  const dealing = view.actions
    .filter((action) => action.start <= time + 1e-6)
    .map((action) => {
      const all = actionHits.get(action.key) ?? [];
      return {
        action,
        hits: all.filter((hit) => hit.time <= time + 1e-6),
        // Hits still to land: it is still dealing DMG.
        pending: all.some((hit) => hit.time > time + 1e-6),
      };
    });
  // Newest on top: the history stays at the top while it is scrolled
  // there; scrolled down to read, it stays put.
  const historyRef = useRef<HTMLUListElement>(null);
  const followHistory = useRef(true);
  // Reactions so far, each its own line, by the time it happened.
  const reactionLines = view.hits.filter(
    (hit) => isReactionHit(hit) && hit.time <= time + 1e-6
  );
  // Actions and reactions in one line, newest on top (an action before a
  // reaction of the same moment).
  const history = [
    ...dealing.map((entry) => ({
      kind: 'action' as const,
      at: entry.action.start,
      order: 0,
      entry,
    })),
    ...reactionLines.map((hit) => ({
      kind: 'reaction' as const,
      at: hit.time,
      order: 1,
      hit,
    })),
  ]
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .reverse();
  const historyKey = `${dealing.map(({ hits }) => hits.length).join(',')}|${
    reactionLines.length
  }`;
  useEffect(() => {
    const list = historyRef.current;
    if (list && followHistory.current) {
      list.scrollTop = 0;
    }
  }, [historyKey]);
  // The combat log: the DMG history, each row selectable.
  if (part === 'log') {
    return (
      <section
        data-testid='inspector-combat-log'
        className='flex h-56 flex-col rounded-lg border bg-card/60 p-2 text-xs'
      >
        <p className='mb-1 text-[11px] font-semibold tracking-wide uppercase'>
          Combat log · DMG history ({dealing.length} action
          {dealing.length === 1 ? '' : 's'}, {reactionLines.length} reaction
          {reactionLines.length === 1 ? '' : 's'})
        </p>
        <ul
          ref={historyRef}
          data-testid='inspector-dmg-history'
          onScroll={(event) => {
            const list = event.currentTarget;
            followHistory.current = list.scrollTop <= 8;
          }}
          className='flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded border p-1'
        >
          {dealing.length === 0 && (
            <li className='text-muted-foreground'>Nothing played yet</li>
          )}
          {history.map((line) => {
            if (line.kind === 'reaction') {
              const { hit } = line;
              const elements = reactionElements(view, hit);
              return (
                <li
                  key={`reaction@${hit.time}@${hit.characterId}`}
                  className={cn(
                    'cursor-pointer rounded bg-violet-500/10 px-1 hover:bg-violet-500/20',
                    selectedKey === hitKey(hit) && 'ring-1 ring-primary'
                  )}
                  onClick={() => onSelect?.(hit)}
                >
                  <span className='flex items-center gap-1'>
                    {elements.map((element) =>
                      elementIconUrl(element) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={element}
                          src={elementIconUrl(element) ?? ''}
                          alt={element}
                          width={16}
                          height={16}
                        />
                      ) : null
                    )}
                    <span className='font-semibold'>{hit.reaction}</span>
                    <span className='text-muted-foreground tabular-nums'>
                      {seconds(hit.time)}
                    </span>
                    <span className='ml-auto font-bold whitespace-nowrap tabular-nums'>
                      {formatNumber(Math.round(hit.damage))}
                    </span>
                  </span>
                  <p className='truncate pl-6 text-muted-foreground'>
                    by {getLoadedCharacter(hit.characterId).character.name} ·{' '}
                    {hit.element}
                  </p>
                </li>
              );
            }
            const { action, hits, pending } = line.entry;
            const damage = hits.reduce((sum, hit) => sum + hit.damage, 0);
            const crits = hits.filter((hit) => hit.isCrit).length;
            const lastHit = hits.at(-1);
            return (
              <li
                key={action.key}
                className={cn(
                  'cursor-pointer rounded px-1 hover:bg-muted',
                  (action === current || pending) && 'bg-muted/60',
                  hits.some((hit) => hitKey(hit) === selectedKey) &&
                    'ring-1 ring-primary'
                )}
                // Shows its biggest hit so far.
                onClick={() => {
                  const biggest = hits.reduce<EnemyHit | null>(
                    (top, hit) => (!top || hit.damage > top.damage ? hit : top),
                    null
                  );
                  if (biggest) {
                    onSelect?.(biggest);
                  }
                }}
              >
                <span className='flex items-center gap-1'>
                  <Owner characterId={action.characterId} />
                  <span className='truncate font-semibold'>{action.label}</span>
                  <span className='text-muted-foreground tabular-nums'>
                    {seconds(action.start)}
                  </span>
                  <span className='ml-auto font-bold whitespace-nowrap tabular-nums'>
                    {formatNumber(Math.round(damage))} · {hits.length} hit
                    {hits.length === 1 ? '' : 's'}
                    {crits > 0 ? ` (${crits} CRIT)` : ''}
                  </span>
                </span>
                {lastHit && (
                  <p className='truncate pl-6 text-muted-foreground tabular-nums'>
                    Last: {lastHit.label} ·{' '}
                    {formatNumber(Math.round(lastHit.damage))}
                    {lastHit.isCrit ? ' CRIT' : ''} {lastHit.element}
                    {lastHit.reaction !== 'None'
                      ? ` · ${lastHit.reaction}`
                      : ''}{' '}
                    at {seconds(lastHit.time)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return (
    <div data-testid='inspector-enemy' className='flex flex-col gap-2 text-xs'>
      {/* 1. The enemy: portrait, name, a fixed slot for its aura's icon,
          the aura's time and its HP. Every row keeps its room when empty,
          so nothing moves. */}
      <section className='flex h-44 flex-col rounded border p-2'>
        <p className='mb-1 font-semibold'>Enemy</p>
        <div className='flex gap-2'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={monsterIconUrl(ENEMY.icon)}
            alt={ENEMY.name}
            width={64}
            height={64}
            className='size-16 shrink-0 rounded-md bg-zinc-800 ring-1 ring-white/10'
          />
          <div className='min-w-0 flex-1'>
            <p className='truncate font-semibold'>
              {ENEMY.name}{' '}
              <span className='font-normal text-muted-foreground'>
                Lv. {level}
              </span>
            </p>
            {/* Aura: icon slot, element, units, time left. */}
            <span className='mt-1 flex h-6 items-center gap-1.5'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60'>
                {aura && elementIconUrl(aura.element) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={elementIconUrl(aura.element) ?? ''}
                    alt={aura.element}
                    width={22}
                    height={22}
                  />
                )}
              </span>
              <span className='w-14 truncate font-semibold'>
                {aura ? aura.element : 'No aura'}
              </span>
              <span className='w-10 text-right tabular-nums'>
                {aura ? `${short(aura.gauge)} U` : ''}
              </span>
            </span>
            <span className='mt-1 flex h-3 items-center gap-1.5 tabular-nums'>
              <span
                className={cn(
                  'relative h-1.5 flex-1 overflow-hidden rounded-full',
                  aura
                    ? ELEMENT_TRACKS[aura.element] ?? 'bg-zinc-500/20'
                    : 'bg-muted'
                )}
              >
                {aura && Number.isFinite(aura.goneIn) && (
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0',
                      ELEMENT_BARS[aura.element] ?? 'bg-zinc-400'
                    )}
                    style={{
                      width: `${
                        Number.isFinite(aura.total) && aura.total > 0
                          ? (aura.goneIn / aura.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                )}
              </span>
              <span className='w-10 text-right'>
                {aura && Number.isFinite(aura.goneIn)
                  ? `${short(aura.goneIn)} s`
                  : '—'}
              </span>
            </span>
          </div>
        </div>
        <span className='mt-auto block'>
          <span className='relative block h-2.5 overflow-hidden rounded-full bg-red-500/20'>
            <span
              className='absolute inset-y-0 left-0 bg-red-500'
              style={{ width: `${hp > 0 ? (left / hp) * 100 : 0}%` }}
            />
          </span>
          <span className='mt-1 flex justify-between tabular-nums'>
            <span>
              HP {formatNumber(Math.round(left))} / {formatNumber(hp)}
            </span>
            <span className='text-muted-foreground'>
              {formatNumber(hp > 0 ? Math.round((left / hp) * 1000) / 10 : 0)}%
            </span>
          </span>
        </span>
      </section>

      {/* 2. DMG and reactions: what the enemy took, the last reaction (its
          row always there) and each reaction's DMG so far. */}
      <section className='flex h-44 flex-col rounded border p-2'>
        <p className='mb-1 font-semibold'>DMG & reactions</p>
        <span className='flex justify-between tabular-nums'>
          <span className='text-muted-foreground'>DMG taken</span>
          <span className='font-bold'>{formatNumber(Math.round(taken))}</span>
        </span>
        <span className='mt-1 flex h-5 items-center gap-1'>
          {reaction ? (
            <>
              {[reaction.element, reaction.hitElement].map((element) =>
                elementIconUrl(element) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={element}
                    src={elementIconUrl(element) ?? ''}
                    alt={element}
                    width={16}
                    height={16}
                  />
                ) : null
              )}
              <span className='font-bold'>{reaction.reaction}</span>
              <span className='text-muted-foreground'>
                {seconds(reaction.time)}
              </span>
            </>
          ) : (
            <span className='text-muted-foreground'>No reaction now</span>
          )}
        </span>
        <ul className='mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded border p-1'>
          {reactions.length === 0 && (
            <li className='text-muted-foreground'>No reaction DMG yet</li>
          )}
          {reactions.map((entry) => (
            <li key={entry.reaction} className='tabular-nums'>
              <span className='flex items-center gap-1'>
                <span className='font-semibold'>{entry.reaction}</span>
                <span className='text-muted-foreground'>×{entry.count}</span>
                <span className='ml-auto font-bold'>
                  {formatNumber(Math.round(entry.damage))}
                </span>
              </span>
              <span className='block truncate text-muted-foreground'>
                last {formatNumber(Math.round(entry.last.damage))} at{' '}
                {seconds(entry.last.time)} ·{' '}
                {getLoadedCharacter(entry.last.characterId).character.name}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Run stats so far. */}
      <section className='flex justify-between rounded border px-2 py-1 tabular-nums'>
        <span className='text-muted-foreground'>Hits</span>
        <span className='font-semibold'>
          {view.hits.filter((hit) => hit.time <= time + 1e-6).length}
        </span>
        <span className='text-muted-foreground'>Reactions</span>
        <span className='font-semibold'>
          {reactions.reduce((sum, entry) => sum + entry.count, 0)}
        </span>
        <span className='text-muted-foreground'>Time</span>
        <span className='font-semibold'>{seconds(time)}</span>
      </section>
    </div>
  );
});

// What is shown in the Event panel: an action (with one of its hits) or
// a hit alone (a reaction). Pinned, it stays while the cursor moves.
export type EventSelection = {
  actionKey: string | null;
  hitKey: string | null;
};

// The play of a step a hit belongs to: the latest of its step started by
// the hit.
const actionOfHit = (view: InspectorView, hit: EnemyHit) =>
  [...view.actions]
    .reverse()
    .find(
      (action) =>
        action.blockUid === hit.blockUid && action.start <= hit.time + 1e-6
    ) ?? null;

type EventPanelProps = {
  view: InspectorView;
  run: TeamRun;
  time: number;
  // The action at the cursor (followed while nothing is pinned).
  atCursor: ActionPiece | undefined;
  selection: EventSelection | null;
  pinned: boolean;
  onSelect: (selection: EventSelection) => void;
  onPin: (pinned: boolean) => void;
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <p className='mt-2 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>
    {children}
  </p>
);

// The Event panel: one action and what it did. Its hits (each with its
// DMG formula, factor by factor, checked against the DMG dealt), the
// blocks it made, and the bonuses on the hit shown.
const EventPanel = memo(
  function EventPanel({
    view,
    run,
    time,
    atCursor,
    selection,
    pinned,
    onSelect,
    onPin,
  }: EventPanelProps) {
    const actionHits = useMemo(() => hitsByAction(view), [view]);
    const action =
      (selection?.actionKey
        ? view.actions.find((entry) => entry.key === selection.actionKey)
        : selection
        ? undefined
        : atCursor) ?? null;
    const hits = action ? actionHits.get(action.key) ?? [] : [];
    const landed = hits.filter((hit) => hit.time <= time + 1e-6);
    // The hit shown: the one picked, else the latest landed.
    const picked =
      (selection?.hitKey &&
        view.hits.find((hit) => hitKey(hit) === selection.hitKey)) ||
      null;
    const hit = picked ?? landed.at(-1) ?? null;
    const member = hit
      ? run.members.find((entry) => entry.characterId === hit.characterId)
      : undefined;
    const entry = hit && member ? member.hitLog[hit.index] : undefined;
    const formula =
      entry &&
      getHitFormula(
        entry,
        STAT_LABELS[
          getLoadedCharacter(hit?.characterId ?? '').character.scalingStat
        ] ?? 'Stat'
      );
    const bonuses = entry && member ? getHitBonuses(run, member, entry) : [];
    const made = action
      ? view.chips.filter(
          (chip) => chip.cause === action.causeId && chip.start <= time + 1e-6
        )
      : [];
    const damage = landed.reduce((sum, entry) => sum + entry.damage, 0);
    const ownerId = action?.characterId ?? hit?.characterId ?? null;
    return (
      <section
        data-testid='inspector-event'
        className='flex h-[30rem] flex-col rounded-lg border bg-card/60 p-2 text-xs'
      >
        <div className='flex items-center gap-1.5'>
          <p className='text-[11px] font-semibold tracking-wide uppercase'>
            Event
          </p>
          <span className='text-muted-foreground'>
            {pinned ? 'pinned' : 'follows the cursor'}
          </span>
          <Button
            type='button'
            size='sm'
            variant={pinned ? 'secondary' : 'ghost'}
            aria-pressed={pinned}
            aria-label={pinned ? 'Unpin' : 'Pin'}
            className='ml-auto h-6 px-2'
            onClick={() => {
              if (!pinned && action) {
                onSelect({ actionKey: action.key, hitKey: hit && hitKey(hit) });
              }
              onPin(!pinned);
            }}
          >
            {pinned ? <PinOff /> : <Pin />}
          </Button>
        </div>
        {!ownerId ? (
          <p className='mt-2 text-muted-foreground'>Nothing played yet</p>
        ) : (
          <div className='-mx-1 min-h-0 flex-1 overflow-y-auto px-1'>
            {/* Header: who, what, when, how much. */}
            <div className='mt-1 flex items-center gap-2 rounded-md bg-muted/40 p-1.5'>
              <CharacterAvatar
                src={avatarOf(ownerId)}
                alt={nameOf(ownerId)}
                size={32}
              />
              <div className='min-w-0 flex-1'>
                <p className='truncate font-semibold'>
                  {action?.label ?? hit?.label}
                </p>
                <p className='text-muted-foreground tabular-nums'>
                  {nameOf(ownerId)} · {seconds(action?.start ?? hit?.time ?? 0)}
                  {action && ` → ${seconds(action.end)}`}
                </p>
              </div>
              <span className='text-right font-bold tabular-nums'>
                {formatNumber(Math.round(action ? damage : hit?.damage ?? 0))}
                <span className='block text-[10px] font-normal text-muted-foreground'>
                  {action
                    ? `${landed.length}/${hits.length} hit${
                        hits.length === 1 ? '' : 's'
                      }`
                    : hit?.reaction}
                </span>
              </span>
            </div>

            {action && hits.length > 0 && (
              <>
                <SectionTitle>Hits</SectionTitle>
                <ul className='flex flex-col gap-0.5'>
                  {hits.map((entry) => {
                    const key = hitKey(entry);
                    const future = entry.time > time + 1e-6;
                    return (
                      <li key={key}>
                        <button
                          type='button'
                          className={cn(
                            'flex w-full items-center gap-1 rounded px-1 text-left hover:bg-muted',
                            hit && key === hitKey(hit) && 'bg-primary/15',
                            future && 'opacity-40'
                          )}
                          onClick={() => {
                            onSelect({ actionKey: action.key, hitKey: key });
                            onPin(true);
                          }}
                        >
                          {elementIconUrl(entry.element) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={elementIconUrl(entry.element) ?? ''}
                              alt={entry.element}
                              width={14}
                              height={14}
                            />
                          )}
                          <span className='truncate'>{entry.label}</span>
                          <span className='shrink-0 text-muted-foreground tabular-nums'>
                            {seconds(entry.time)}
                          </span>
                          {entry.isCrit && (
                            <span className='rounded bg-amber-500/20 px-1 text-[10px] font-bold text-amber-400'>
                              CRIT
                            </span>
                          )}
                          <span className='ml-auto shrink-0 pl-1 font-semibold tabular-nums'>
                            {formatNumber(Math.round(entry.damage))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {formula && hit && (
              <>
                <SectionTitle>
                  DMG formula · {hit.label}{' '}
                  <span
                    className={cn(
                      'normal-case',
                      formula.matches ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {formula.matches ? '✓ matches' : '✗ does not match'}
                  </span>
                </SectionTitle>
                <table
                  data-testid='inspector-formula'
                  className='w-full tabular-nums'
                >
                  <tbody>
                    {formula.rows.map((row) => (
                      <tr key={row.label} className='border-b border-border/40'>
                        <td className='py-0.5 text-muted-foreground'>
                          {row.label}
                        </td>
                        <td className='py-0.5 text-right'>{row.value}</td>
                        <td className='py-0.5 pl-2 text-right font-semibold'>
                          {row.result}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className='py-0.5 font-semibold'>= DMG</td>
                      <td />
                      <td className='py-0.5 pl-2 text-right font-bold'>
                        {formatNumber(Math.round(hit.damage))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {bonuses.length > 0 && (
              <>
                <SectionTitle>Bonuses on this hit</SectionTitle>
                <ul className='flex flex-col gap-0.5'>
                  {bonuses.map((bonus) => (
                    <li key={bonus.id} className='flex items-center gap-1.5'>
                      {bonus.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={bonus.iconUrl}
                          alt=''
                          width={16}
                          height={16}
                          className='size-4 shrink-0 rounded'
                        />
                      ) : (
                        <span className='size-4 shrink-0' />
                      )}
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate'>{bonus.label}</span>
                        <span className='block truncate text-[10px] text-muted-foreground'>
                          {bonus.from}
                          {bonus.remaining !== null &&
                            ` · ${short(bonus.remaining)} s left`}
                        </span>
                      </span>
                      <span className='shrink-0 font-semibold whitespace-nowrap'>
                        {bonus.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {made.length > 0 && (
              <>
                <SectionTitle>
                  Created by this action ({made.length})
                </SectionTitle>
                <div className='flex flex-wrap gap-1'>
                  {made.map((chip) => (
                    <ChipPiece key={chip.key} chip={chip} time={time} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    );
  },
  (before, after) =>
    before.view === after.view &&
    before.run === after.run &&
    before.atCursor === after.atCursor &&
    before.selection === after.selection &&
    before.pinned === after.pinned &&
    Math.round(before.time / QUANTUM) === Math.round(after.time / QUANTUM)
);

// The inspector's lanes: blocks grouped by what they do, so the bonuses
// that change DMG never get lost among particles and states.
const LANES: { id: string; title: string; types: BlockType[] }[] = [
  { id: 'buffs', title: 'Buffs & debuffs', types: ['bonus', 'debuff'] },
  {
    id: 'mechanics',
    title: 'Mechanics',
    types: ['extraHit', 'cooldown', 'state'],
  },
  { id: 'resources', title: 'Resources', types: ['energy', 'heal'] },
  {
    id: 'special',
    title: 'Special mechanics',
    types: ['nightsoul', 'bondOfLife'],
  },
];

type QueueLaneProps = {
  title: string;
  // Its blocks up now and the ones leaving, in queue order.
  chips: BlockChip[];
  exiting: Map<string, BlockChip>;
  time: number;
  // A member to look at: the others' blocks are dimmed.
  focus: string | null;
  'data-testid'?: string;
};

// One lane: a queue with no scrollbar (the wheel and dragging pan it)
// that follows its newest block while it is at its end; blocks slide in
// and fold out.
const QueueLane = ({
  title,
  chips,
  exiting,
  time,
  focus,
  'data-testid': testId,
}: QueueLaneProps) => {
  const laneRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const drag = useRef<{ x: number; scrollLeft: number } | null>(null);
  const atEnd = (lane: HTMLDivElement) =>
    lane.scrollLeft + lane.clientWidth >= lane.scrollWidth - 8;
  useEffect(() => {
    const lane = laneRef.current;
    if (lane && follow.current) {
      lane.scrollLeft = lane.scrollWidth;
    }
  }, [chips.length]);
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (lane.scrollWidth <= lane.clientWidth) {
        return;
      }
      event.preventDefault();
      lane.scrollLeft +=
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      follow.current = atEnd(lane);
    };
    lane.addEventListener('wheel', handleWheel, { passive: false });
    return () => lane.removeEventListener('wheel', handleWheel);
  }, []);
  const upNow = chips.filter((chip) => !exiting.has(chip.key)).length;
  return (
    <section className='mt-1.5 first:mt-0'>
      <p className='mb-0.5 text-[11px] font-semibold text-muted-foreground'>
        {title} ({upNow})
      </p>
      <div
        ref={laneRef}
        data-testid={testId}
        className='flex h-[5.5rem] cursor-grab touch-pan-y gap-1 overflow-x-auto rounded-md border border-dashed p-1 [scrollbar-width:none] select-none active:cursor-grabbing [&_img]:pointer-events-none [&::-webkit-scrollbar]:hidden'
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) {
            return;
          }
          drag.current = {
            x: event.clientX,
            scrollLeft: event.currentTarget.scrollLeft,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) {
            return;
          }
          const moved = event.clientX - current.x;
          // A small move is still a click (a block's tooltip).
          if (Math.abs(moved) > 3) {
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.scrollLeft = current.scrollLeft - moved;
            follow.current = atEnd(event.currentTarget);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {chips.length === 0 && (
          <p className='self-center px-2 text-xs text-muted-foreground'>
            Nothing here now
          </p>
        )}
        {chips.map((chip) => {
          const leaving = exiting.has(chip.key);
          const dimmed =
            focus !== null &&
            chip.characterId !== focus &&
            chip.holder !== focus &&
            chip.healed !== focus;
          return (
            <div
              key={chip.key}
              className={cn(
                'shrink-0 transition-all duration-300 ease-out',
                leaving
                  ? '-mr-1 max-w-0 scale-95 opacity-0'
                  : 'max-w-96 animate-in duration-300 fade-in-0 slide-in-from-right-4',
                !leaving && dimmed && 'opacity-30'
              )}
            >
              <ChipPiece chip={chip} time={time} />
            </div>
          );
        })}
      </div>
    </section>
  );
};

type SimulationInspectorProps = {
  // The members' builds (the team's, for those in it), in party order.
  members: SimulationValues[];
};

// The run, replayed. Below, the rotation (always all of it). Above, a
// queue that starts empty: as time runs, each block an action made (a
// trigger, a status, a stack) is added at its end.
const SimulationInspector = ({ members }: SimulationInspectorProps) => {
  // A new roll of the CRITs on demand.
  const [roll, setRoll] = useState(0);
  const run = useMemo(
    () => runInspectorTest(members),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, roll]
  );
  // Each member's weapon refinement (its passive's in-game text).
  const refinements = useMemo(
    () =>
      Object.fromEntries(
        members.map((values) => [
          values.character,
          getWeaponRefinement(
            getLoadedCharacter(values.character).character.weapon,
            parseValues(values)
          ),
        ])
      ),
    [members]
  );
  const view = useMemo(
    () => buildInspectorView(run, refinements),
    [run, refinements]
  );
  const actionsById = useMemo(
    () =>
      new Map(
        getTeamActions(run.members.map((member) => member.characterId)).map(
          (action) => [action.id, action]
        )
      ),
    [run]
  );
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const slots = useMemo(
    () =>
      new Map(run.members.map((member, index) => [member.characterId, index])),
    [run]
  );

  // A new run starts from the beginning.
  useEffect(() => {
    setTime(0);
    setPlaying(false);
  }, [run]);

  // Playback in real time × speed.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return undefined;
    }
    let handle = 0;
    const tick = (now: number) => {
      const elapsed = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setTime((current) => {
        const next = current + elapsed * speed;
        if (next >= view.duration) {
          setPlaying(false);
          return view.duration;
        }
        return next;
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, view.duration]);

  const stepTo = (direction: 1 | -1) => {
    setPlaying(false);
    const epsilon = 1e-6;
    const next =
      direction === 1
        ? view.stepTimes.find((entry) => entry > time + epsilon)
        : [...view.stepTimes].reverse().find((entry) => entry < time - epsilon);
    setTime(next ?? (direction === 1 ? view.duration : 0));
  };

  // The blocks made so far, in the order they were made.
  // A block leaves the queue when its time is over (an instant one after
  // a moment).
  const visibleUntil = (chip: BlockChip) =>
    chip.end ?? chip.start + INSTANT_SECONDS;
  // A queue: each block joins at the end when it starts, is updated in
  // place, and leaves when it is over; it never moves.
  const shown = view.chips.filter(
    (chip) => chip.start <= time + 1e-6 && time < visibleUntil(chip)
  );
  // The enemy's HP and level (the team's enemy settings).
  const enemy = useMemo(() => {
    const parsed = parseValues(members[0]);
    return {
      hp: readNumber(parsed, 'enemyHp'),
      level: readNumber(parsed, 'enemyLevel'),
    };
  }, [members]);
  // Actions played by now (they are in time order), and the latest one.
  const playedCount = view.actions.filter(
    (action) => action.start <= time + 1e-6
  ).length;
  const current = view.actions[playedCount - 1];

  // The rotation ruler: actions one after another, never overlapping,
  // each as wide as it lasted (at least readable). Time maps to x through
  // their edges, so the ticks and the cursor match the actions.
  const ruler = useMemo(() => {
    const points: [number, number][] = [[0, 0]];
    let x = 0;
    let at = 0;
    const pieces = view.actions.map((action) => {
      const start = Math.max(action.start, at);
      const left = x + (start - at) * RULER_PX;
      const width = Math.max(
        MIN_PIECE_PX,
        (Math.max(action.end, start) - start) * RULER_PX
      );
      const end = Math.max(action.end, start);
      points.push([start, left], [end, left + width]);
      x = left + width + PIECE_GAP_PX;
      at = end;
      points.push([at, x]);
      return { left, width };
    });
    const totalWidth = x + Math.max(0, view.duration - at) * RULER_PX;
    points.push([Math.max(view.duration, at), totalWidth]);
    const toX = (value: number) => {
      const index = points.findIndex(([t]) => t >= value);
      if (index <= 0) {
        return 0;
      }
      const [t0, x0] = points[index - 1];
      const [t1, x1] = points[index];
      return t1 === t0 ? x1 : x0 + ((value - t0) / (t1 - t0)) * (x1 - x0);
    };
    const toTime = (position: number) => {
      const index = points.findIndex(([, px]) => px >= position);
      if (index <= 0) {
        return 0;
      }
      const [t0, x0] = points[index - 1];
      const [t1, x1] = points[index];
      return x1 === x0 ? t1 : t0 + ((position - x0) / (x1 - x0)) * (t1 - t0);
    };
    return { pieces, totalWidth, toX, toTime };
  }, [view.actions, view.duration]);

  // The rotation ruler, as a video editor's timeline: a fixed window with
  // no scrollbar whose view pans. Dragging the cursor moves it under the
  // pointer; held at an edge, the view keeps panning that way; playing,
  // the view follows the cursor; the wheel pans.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) =>
      setViewWidth(entry.contentRect.width)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const contentWidth = ruler.totalWidth + 8;
  const maxOffset = Math.max(0, contentWidth - viewWidth);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const clampOffset = (value: number) =>
    Math.min(maxOffset, Math.max(0, value));
  const moveView = (value: number) => {
    offsetRef.current = clampOffset(value);
    setOffset(offsetRef.current);
  };
  const timeAtX = (x: number, viewOffset: number) =>
    Math.min(view.duration, Math.max(0, ruler.toTime(x + viewOffset)));

  const scrubbing = useRef(false);
  // Where the pointer is in the window, while dragging.
  const pointerX = useRef(0);
  const edgeFrame = useRef(0);
  const EDGE_PX = 56;
  const panAtEdges = () => {
    if (!scrubbing.current) {
      return;
    }
    const x = pointerX.current;
    const speed =
      x > viewWidth - EDGE_PX
        ? ((x - (viewWidth - EDGE_PX)) / EDGE_PX) * 18
        : x < EDGE_PX
        ? -((EDGE_PX - x) / EDGE_PX) * 18
        : 0;
    if (speed !== 0) {
      moveView(offsetRef.current + speed);
      setTime(timeAtX(Math.min(viewWidth, Math.max(0, x)), offsetRef.current));
    }
    edgeFrame.current = requestAnimationFrame(panAtEdges);
  };
  const stopScrub = () => {
    scrubbing.current = false;
    cancelAnimationFrame(edgeFrame.current);
  };
  const localX = (clientX: number) =>
    clientX - (viewportRef.current?.getBoundingClientRect().left ?? 0);

  // Playing (or stepping), the view follows the cursor.
  useEffect(() => {
    if (scrubbing.current || viewWidth === 0) {
      return;
    }
    const x = ruler.toX(time);
    if (x - offsetRef.current > viewWidth * 0.85 || x < offsetRef.current) {
      moveView(x - viewWidth * 0.15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, viewWidth]);

  // The wheel (or a trackpad's sideways swipe) pans the view.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (maxOffset <= 0) {
        return;
      }
      event.preventDefault();
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      moveView(offsetRef.current + delta);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxOffset]);

  // Blocks that just left stay a moment, fading and folding, so the
  // others slide over instead of jumping; new ones slide in.
  // The rotation's pieces only redraw when the cursor passes an action.
  const rulerPieces = useMemo(
    () =>
      view.actions.map((action, index) => {
        const rotationAction = actionsById.get(action.actionId);
        return (
          <span
            key={action.key}
            className='absolute'
            style={{
              left: ruler.pieces[index].left,
              top: RULER_HEIGHT,
            }}
          >
            <QueuePiece
              width={ruler.pieces[index].width}
              characterId={action.characterId}
              colorClass={
                getMemberStyle(slots.get(action.characterId) ?? 0).chip
              }
              stripeClass={
                rotationAction
                  ? KIND_STYLES[rotationAction.kind].bar
                  : 'bg-zinc-400'
              }
              icon={
                rotationAction ? (
                  <RotationActionIcon action={rotationAction} size={20} />
                ) : (
                  <span className='size-5' />
                )
              }
              keyLabel={rotationAction?.shortLabel ?? action.label}
              footer={seconds(action.start)}
              title={`${action.label}: ${seconds(action.start)} → ${seconds(
                action.end
              )}`}
              dimmed={index >= playedCount}
              highlighted={index === playedCount - 1}
            />
          </span>
        );
      }),
    [view.actions, ruler, actionsById, slots, playedCount]
  );

  const shownKey = shown.map((chip) => chip.key).join('|');
  const [exiting, setExiting] = useState<Map<string, BlockChip>>(
    () => new Map()
  );
  const previousShown = useRef<BlockChip[]>([]);
  const exitTimers = useRef<number[]>([]);
  useEffect(() => {
    const now = new Set(shown.map((chip) => chip.key));
    const gone = previousShown.current.filter((chip) => !now.has(chip.key));
    previousShown.current = shown;
    setExiting((current) => {
      const next = new Map(current);
      now.forEach((key) => next.delete(key));
      gone.forEach((chip) => next.set(chip.key, chip));
      return next;
    });
    if (gone.length > 0) {
      exitTimers.current.push(
        window.setTimeout(
          () =>
            setExiting((current) => {
              const next = new Map(current);
              gone.forEach((chip) => next.delete(chip.key));
              return next;
            }),
          EXIT_MS
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  useEffect(
    () => () => exitTimers.current.forEach((timer) => clearTimeout(timer)),
    []
  );
  // In queue order: the blocks up now and the ones leaving.
  const shownKeys = useMemo(() => new Set(shownKey.split('|')), [shownKey]);
  const queued = view.chips.filter(
    (chip) => shownKeys.has(chip.key) || exiting.has(chip.key)
  );

  // A member to look at (the others' blocks dim), or everyone.
  const [focus, setFocus] = useState<string | null>(null);

  // The Event panel: the action at the cursor (the one playing, else the
  // latest started), unless one is pinned.
  const [selection, setSelection] = useState<EventSelection | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    setSelection(null);
    setPinned(false);
  }, [run]);
  const atCursor =
    [...view.actions]
      .reverse()
      .find(
        (action) => action.start <= time + 1e-6 && time <= action.end + 1e-6
      ) ?? current;
  const selectHit = useCallback(
    (hit: EnemyHit) => {
      setSelection({
        actionKey: isReactionHit(hit)
          ? null
          : actionOfHit(view, hit)?.key ?? null,
        hitKey: hitKey(hit),
      });
      setPinned(true);
    },
    [view]
  );
  const handlePin = useCallback((value: boolean) => {
    setPinned(value);
    if (!value) {
      setSelection(null);
    }
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <Card data-testid='simulation-inspector' className='min-w-0 gap-3 p-4'>
        {/* Header: title, the party (look at one member: the others'
            blocks dim) and the player. */}
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
          <div className='min-w-0'>
            <p className='font-semibold'>Simulation inspector</p>
            <p className='text-xs text-muted-foreground'>
              Chevreuse Q, hold E, Iansan E, Q, again whenever ready · 60 s (not
              the team&apos;s rotation)
            </p>
          </div>
          <div className='flex items-center gap-1 text-xs'>
            {run.members.map((member) => (
              <Button
                key={member.characterId}
                type='button'
                size='sm'
                variant={focus === member.characterId ? 'secondary' : 'ghost'}
                aria-pressed={focus === member.characterId}
                title={`Look at ${member.name}`}
                onClick={() =>
                  setFocus((current) =>
                    current === member.characterId ? null : member.characterId
                  )
                }
              >
                <Owner characterId={member.characterId} />
                {member.name}
              </Button>
            ))}
          </div>
          <div className='ml-auto flex flex-wrap items-center gap-1.5'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              aria-label='Previous step'
              onClick={() => stepTo(-1)}
            >
              <SkipBack />
            </Button>
            <Button
              type='button'
              size='sm'
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => {
                if (time >= view.duration) {
                  setTime(0);
                }
                setPlaying((value) => !value);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              aria-label='Next step'
              onClick={() => stepTo(1)}
            >
              <SkipForward />
            </Button>
            {SPEEDS.map((value) => (
              <Button
                key={value}
                type='button'
                size='sm'
                variant={speed === value ? 'secondary' : 'ghost'}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </Button>
            ))}
            <span className='font-mono text-sm tabular-nums'>
              {seconds(time)} / {seconds(view.duration)}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setRoll((value) => value + 1)}
            >
              <Dices />
              Simulate again
            </Button>
          </div>
        </div>

        <div className='grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]'>
          {/* Center: what is up now, by lane, and the rotation. */}
          <div className='min-w-0 rounded-lg border bg-card/60 p-2'>
            <p className='mb-1 text-[11px] font-semibold tracking-wide uppercase'>
              Blocks up now ({shown.length})
            </p>
            <div data-testid='inspector-queue'>
              {LANES.map((lane) => (
                <QueueLane
                  key={lane.id}
                  data-testid={`inspector-lane-${lane.id}`}
                  title={lane.title}
                  chips={queued.filter((chip) =>
                    lane.types.includes(chip.type)
                  )}
                  exiting={exiting}
                  time={time}
                  focus={focus}
                />
              ))}
            </div>
            <p className='mt-3 mb-1 text-[11px] font-semibold tracking-wide uppercase'>
              Rotation (drag the red cursor)
            </p>
            {/* The window (no scrollbar) and, inside, the panned timeline. */}
            <div
              ref={viewportRef}
              role='slider'
              tabIndex={0}
              aria-label='Time'
              aria-valuemin={0}
              aria-valuemax={view.duration}
              aria-valuenow={Math.round(time * 100) / 100}
              aria-valuetext={seconds(time)}
              className='relative cursor-ew-resize touch-none overflow-hidden rounded-md border select-none focus-visible:outline-2 focus-visible:outline-ring [&_img]:pointer-events-none'
              style={{ height: RULER_HEIGHT + PIECE_ROW_PX + 8 }}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                scrubbing.current = true;
                setPlaying(false);
                pointerX.current = localX(event.clientX);
                setTime(timeAtX(pointerX.current, offsetRef.current));
                cancelAnimationFrame(edgeFrame.current);
                edgeFrame.current = requestAnimationFrame(panAtEdges);
              }}
              onPointerMove={(event) => {
                if (scrubbing.current) {
                  pointerX.current = localX(event.clientX);
                  setTime(
                    timeAtX(
                      Math.min(viewWidth, Math.max(0, pointerX.current)),
                      offsetRef.current
                    )
                  );
                }
              }}
              onPointerUp={stopScrub}
              onPointerCancel={stopScrub}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 5 : 0.5;
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  setPlaying(false);
                  setTime((value) =>
                    Math.min(
                      view.duration,
                      Math.max(
                        0,
                        value + (event.key === 'ArrowRight' ? step : -step)
                      )
                    )
                  );
                }
              }}
            >
              <div
                className='absolute top-1 left-1'
                style={{
                  width: contentWidth,
                  height: RULER_HEIGHT + PIECE_ROW_PX,
                  transform: `translateX(${-offset}px)`,
                }}
              >
                {/* Ruler: a tick every 5 s. */}
                {Array.from(
                  { length: Math.floor(view.duration / 5) + 1 },
                  (_, index) => index * 5
                ).map((tick) => (
                  <span
                    key={tick}
                    className='absolute top-0 border-l border-border pl-0.5 text-[9px] leading-none text-muted-foreground tabular-nums'
                    style={{ left: ruler.toX(tick), height: RULER_HEIGHT }}
                  >
                    {tick}s
                  </span>
                ))}
                {rulerPieces}

                {/* The cursor. */}
                <span
                  aria-hidden
                  className='pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-red-500'
                  style={{ left: ruler.toX(time) }}
                >
                  <span className='absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-red-500 ring-2 ring-background' />
                </span>
              </div>
            </div>
          </div>

          {/* Right: the event at the cursor (or pinned) and the enemy. */}
          <div className='flex min-w-0 flex-col gap-3'>
            <EventPanel
              view={view}
              run={run}
              time={time}
              atCursor={atCursor}
              selection={selection}
              pinned={pinned}
              onSelect={setSelection}
              onPin={handlePin}
            />
            <EnemyPanel
              view={view}
              time={time}
              current={current}
              hp={enemy.hp}
              level={enemy.level}
              part='enemy'
            />
          </div>
        </div>

        {/* Bottom: the combat log (a click pins its event). */}
        <EnemyPanel
          view={view}
          time={time}
          current={current}
          hp={enemy.hp}
          level={enemy.level}
          part='log'
          selectedKey={pinned ? selection?.hitKey ?? null : null}
          onSelect={selectHit}
        />
      </Card>
    </TooltipProvider>
  );
};

export default SimulationInspector;
