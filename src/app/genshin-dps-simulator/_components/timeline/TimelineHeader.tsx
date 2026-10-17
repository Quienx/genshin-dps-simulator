import {
  Dices,
  Minus,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { getLoadedCharacter } from '../../_lib/characterData';
import formatNumber from '../../_lib/formatNumber';
import { iconUrl } from '../../_lib/genshinIcons';

export const SPEEDS = [0.5, 1, 2, 4];

// A run the timeline can show (picked in the title bar): a team, or one
// character alone; `avatars` are its members' ids.
export type TimelineScenario = {
  id: string;
  label: string;
  group: 'team' | 'solo';
  avatars: string[];
};

const SCENARIO_GROUPS: { id: TimelineScenario['group']; label: string }[] = [
  { id: 'team', label: 'Teams' },
  { id: 'solo', label: 'Single character (its own rotation)' },
];

// The members' faces, overlapping a little.
const ScenarioAvatars = ({ ids }: { ids: string[] }) => (
  <span className='flex shrink-0 -space-x-1.5'>
    {ids.map((id) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={id}
        src={iconUrl(getLoadedCharacter(id).character.icons.avatar)}
        alt=''
        width={20}
        height={20}
        className='size-5 rounded-full bg-slate-800 ring-1 ring-slate-900'
      />
    ))}
  </span>
);

export type HeaderMember = {
  characterId: string;
  name: string;
  avatar: string;
  // The member's own color (its stripe on the card).
  color?: { bar: string };
};

type TimelineHeaderProps = {
  members: HeaderMember[];
  duration: number;
  time: number;
  playing: boolean;
  speed: number;
  onTogglePlay: () => void;
  onStep: (direction: 1 | -1) => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (time: number) => void;
  onZoom: (direction: 1 | -1) => void;
  onFit: () => void;
  // Runs the simulation again (new CRIT rolls).
  onSimulate: () => void;
  scenarios: TimelineScenario[];
  scenario: string;
  onScenarioChange: (id: string) => void;
  // Opens a member's build.
  onMemberClick: (characterId: string) => void;
};

const IconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type='button'
    aria-label={label}
    title={label}
    onClick={onClick}
    className='flex size-7 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/60 text-slate-100 transition hover:bg-slate-700/70 [&_svg]:size-3.5'
  >
    {children}
  </button>
);

// The inspector's top bar: the party, the player and the zoom.
const TimelineHeader = ({
  members,
  duration,
  time,
  playing,
  speed,
  onTogglePlay,
  onStep,
  onSpeedChange,
  onSeek,
  onZoom,
  onFit,
  onSimulate,
  scenarios,
  scenario,
  onScenarioChange,
  onMemberClick,
}: TimelineHeaderProps) => (
  <header className='flex shrink-0 flex-col gap-2'>
    <div className='flex items-center gap-2'>
      <Sparkles className='size-5 text-sky-400' aria-hidden />
      <div>
        <h1 className='text-sm leading-tight font-semibold text-slate-50'>
          Simulation Inspector
        </h1>
        <p className='text-[10px] text-slate-400'>
          Genshin Impact · {formatNumber(duration)}s Combat Simulation
        </p>
      </div>
      <Select value={scenario} onValueChange={onScenarioChange}>
        <SelectTrigger
          aria-label='Simulation'
          data-testid='timeline-scenario'
          size='sm'
          className='ml-auto w-64 border-slate-700/60 bg-slate-900/70 text-[11px] text-slate-100 dark:bg-slate-900/70'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align='end'
          className='border-slate-700 bg-slate-900 text-slate-100'
        >
          {SCENARIO_GROUPS.map((group) => {
            const entries = scenarios.filter(
              (entry) => entry.group === group.id
            );
            return entries.length === 0 ? null : (
              <SelectGroup key={group.id}>
                <p className='px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase'>
                  {group.label}
                </p>
                {entries.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={entry.id}
                    data-testid={`timeline-scenario-${entry.id}`}
                    className='text-[11px] focus:bg-slate-800 focus:text-slate-50'
                  >
                    <ScenarioAvatars ids={entry.avatars} />
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>

    <div
      data-testid='timeline-header'
      className='flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/70 px-2 py-1.5'
    >
      <div className='flex flex-wrap gap-1.5'>
        {members.map((member) => (
          <button
            type='button'
            key={member.characterId}
            data-testid={`timeline-member-${member.characterId}`}
            title={`${member.name}: see the build`}
            onClick={() => onMemberClick(member.characterId)}
            className='relative flex items-center gap-1.5 overflow-hidden rounded-md border border-slate-700/60 bg-slate-800/60 py-0.5 pr-3 pl-2 text-left transition hover:border-sky-500/50 hover:bg-slate-700/60'
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-0 left-0 w-1',
                member.color?.bar ?? 'bg-slate-500'
              )}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={member.avatar}
              alt=''
              width={28}
              height={28}
              className='size-7 rounded-md bg-slate-700'
            />
            <div className='leading-tight'>
              <p className='text-[11px] text-slate-100'>{member.name}</p>
              <p className='text-[10px] text-slate-400'>Lv. 90</p>
            </div>
          </button>
        ))}
      </div>

      <div className='flex items-center gap-1 border-l border-slate-700/60 pl-2.5'>
        <IconButton label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton label='Previous step' onClick={() => onStep(-1)}>
          <SkipBack />
        </IconButton>
        <IconButton label='Next step' onClick={() => onStep(1)}>
          <SkipForward />
        </IconButton>
      </div>

      <div className='flex min-w-64 flex-1 flex-col gap-1 border-l border-slate-700/60 pl-2.5'>
        <div className='flex items-center gap-1'>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type='button'
              aria-pressed={speed === value}
              onClick={() => onSpeedChange(value)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] text-slate-300 transition hover:bg-slate-800',
                speed === value &&
                  'bg-sky-600/40 text-sky-50 hover:bg-sky-600/50'
              )}
            >
              {value}×
            </button>
          ))}
          <span
            data-testid='timeline-time'
            className='ml-2 font-mono text-[11px] text-slate-100 tabular-nums'
          >
            {time.toFixed(3)} s{' '}
            <span className='text-slate-400'>/ {formatNumber(duration)} s</span>
          </span>
        </div>
        <input
          type='range'
          aria-label='Time'
          min={0}
          max={duration}
          step={0.001}
          value={time}
          onChange={(event) => onSeek(Number(event.target.value))}
          className='h-1 w-full cursor-pointer accent-sky-500'
        />
      </div>

      <div className='ml-auto flex items-center gap-1.5'>
        <div className='flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-800/60 py-0.5 pr-0.5 pl-2.5 text-[11px] text-slate-300'>
          Zoom
          <button
            type='button'
            aria-label='Zoom out'
            onClick={() => onZoom(-1)}
            className='flex size-6 items-center justify-center rounded-md hover:bg-slate-700'
          >
            <Minus className='size-3' />
          </button>
          <button
            type='button'
            aria-label='Zoom in'
            onClick={() => onZoom(1)}
            className='flex size-6 items-center justify-center rounded-md hover:bg-slate-700'
          >
            <Plus className='size-3' />
          </button>
        </div>
        <button
          type='button'
          onClick={onFit}
          className='h-7 rounded-md border border-slate-700/60 bg-slate-800/60 px-3 text-[11px] text-slate-300 hover:bg-slate-700/70'
        >
          Fit
        </button>
        <button
          type='button'
          data-testid='timeline-simulate'
          onClick={onSimulate}
          className='flex h-7 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-[11px] font-medium text-white shadow hover:bg-sky-500'
        >
          <Dices className='size-3.5' aria-hidden />
          Simulate again
        </button>
      </div>
    </div>
  </header>
);

export default TimelineHeader;
