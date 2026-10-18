import {
  Dices,
  Minus,
  Pause,
  Play,
  Plus,
  Save,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { memo, ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import ShareMenu from './ShareMenu';
import { SharedRotation } from './shareRotation';
import { getLoadedCharacter } from '../../_lib/characterData';
import { CHARACTER_LIST } from '../../_lib/characters';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl, iconUrl } from '../../_lib/genshinIcons';

export const SPEEDS = [0.5, 1, 2, 4];
const TEAM_MAX = 4;

// A run the timeline can show (picked in the title bar): a team, or one
// character alone; `avatars` are its members' ids.
export type TimelineScenario = {
  id: string;
  label: string;
  // 'draft': the team being edited; 'mine': teams saved under a name.
  group: 'draft' | 'mine' | 'team' | 'solo';
  avatars: string[];
};

const SCENARIO_GROUPS: { id: TimelineScenario['group']; label: string }[] = [
  { id: 'draft', label: 'In edition' },
  { id: 'mine', label: 'My teams' },
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
  // A run is being played (the button says so).
  simulating?: boolean;
  scenarios: TimelineScenario[];
  scenario: string;
  onScenarioChange: (id: string) => void;
  // Opens a member's build.
  onMemberClick: (characterId: string) => void;
  // A party picked with the team button (its members' ids, in order).
  onTeamChange: (ids: string[]) => void;
  // Saving the team in edition under a name, or deleting a saved one.
  teamActions: TeamActions | null;
  // Import / Export: the team on screen (its builds and rotation), and
  // loading a friend's, which switches to their team.
  share: {
    current: SharedRotation;
    label: string;
    onImport: (shared: SharedRotation) => string | null;
  };
};

// Picks the party: up to four characters, in the order clicked; Apply
// shows that team.
const TeamPicker = ({
  current,
  onApply,
}: {
  current: string[];
  onApply: (ids: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(current);
  // The team's members first, as the game's party setup: set when the
  // menu opens, so the cards stay put while picking.
  const firstOf = (team: string[]) => [
    ...team,
    ...CHARACTER_LIST.map((character) => character.id).filter(
      (id) => !team.includes(id)
    ),
  ];
  const [listed, setListed] = useState<string[]>(() => firstOf(current));
  const ref = useRef<HTMLDivElement>(null);
  // A click outside closes it.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const toggle = (id: string) =>
    setPicked((ids) =>
      ids.includes(id)
        ? ids.filter((entry) => entry !== id)
        : ids.length < TEAM_MAX
        ? [...ids, id]
        : ids
    );
  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        data-testid='timeline-team-picker'
        title='Pick the team'
        aria-expanded={open}
        onClick={() => {
          setPicked(current);
          setListed(firstOf(current));
          setOpen(!open);
        }}
        className='flex h-9 items-center gap-1 rounded-md border border-dashed border-slate-600 bg-slate-800/40 px-2 text-[11px] text-slate-300 transition hover:border-sky-500/60 hover:bg-slate-700/60 hover:text-slate-100'
      >
        <UserPlus className='size-4' aria-hidden />
        Team
      </button>
      {open && (
        <div
          data-testid='timeline-team-picker-panel'
          className='absolute top-full left-0 z-50 mt-1 w-80 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl'
        >
          <p className='mb-1.5 text-[10px] text-slate-400'>
            Up to {TEAM_MAX} characters, in the order you pick them. One alone
            plays its own rotation.
          </p>
          {/* As the game's party setup: each portrait on its rarity's
              background, its element in the corner and its name below. */}
          <div className='grid grid-cols-4 gap-1.5'>
            {listed.map((id) => {
              const character = CHARACTER_LIST.find((entry) => entry.id === id);
              if (!character) {
                return null;
              }
              const order = picked.indexOf(character.id);
              const full = order < 0 && picked.length >= TEAM_MAX;
              const data = getLoadedCharacter(character.id).character;
              const element = elementIconUrl(data.element);
              return (
                <button
                  type='button'
                  key={character.id}
                  data-testid={`timeline-team-pick-${character.id}`}
                  aria-pressed={order >= 0}
                  disabled={full}
                  title={character.name}
                  onClick={() => toggle(character.id)}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-sm bg-[#e9e5dc] text-left shadow transition disabled:opacity-30',
                    // Picked: a gold frame and glow, raised.
                    order >= 0
                      ? '-translate-y-0.5 ring-[3px] ring-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.55)]'
                      : 'ring-1 ring-slate-700/60 hover:ring-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'relative block aspect-square w-full rounded-br-md',
                      data.rarity >= 5
                        ? 'bg-gradient-to-br from-[#6b4a2e] to-[#b8782c]'
                        : 'bg-gradient-to-br from-[#4e4a75] to-[#9a6fc4]'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconUrl(data.icons.avatar)}
                      alt=''
                      className='size-full object-cover'
                    />
                    {element && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={element}
                        alt={data.element}
                        className='absolute top-0.5 left-0.5 size-4 drop-shadow'
                      />
                    )}
                    {order >= 0 && (
                      <span className='absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-amber-300 text-[11px] font-bold text-slate-900 shadow ring-1 ring-amber-100'>
                        {order + 1}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'truncate px-0.5 py-0.5 text-center text-[10px]',
                      order >= 0
                        ? 'bg-amber-300 font-semibold text-slate-900'
                        : 'font-medium text-[#4a4a4a]'
                    )}
                  >
                    {character.name}
                  </span>
                </button>
              );
            })}
          </div>
          <div className='mt-2 flex justify-end gap-1.5'>
            <button
              type='button'
              onClick={() => setOpen(false)}
              className='h-7 rounded-md border border-slate-700/60 px-3 text-[11px] text-slate-300 hover:bg-slate-800'
            >
              Cancel
            </button>
            <button
              type='button'
              data-testid='timeline-team-apply'
              disabled={picked.length === 0}
              onClick={() => {
                setOpen(false);
                onApply(picked);
              }}
              className='h-7 rounded-md bg-sky-600 px-3 text-[11px] font-medium text-white hover:bg-sky-500 disabled:opacity-40'
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// What the header offers for the team on screen: saving the draft under
// a name, or deleting a saved team.
export type TeamActions =
  | { kind: 'draft'; suggested: string; onSave: (name: string) => void }
  | { kind: 'mine'; name: string; onDelete: () => void };

// The draft into "My teams", under a name (the members' by default).
const SaveTeamButton = ({
  suggested,
  onSave,
}: {
  suggested: string;
  onSave: (name: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggested);
  const save = () => {
    setOpen(false);
    onSave(name);
  };
  return (
    <div className='relative'>
      <button
        type='button'
        data-testid='timeline-team-save'
        aria-expanded={open}
        onClick={() => {
          setName(suggested);
          setOpen(!open);
        }}
        className='flex h-8 items-center gap-1 rounded-md bg-sky-600 px-2.5 text-[11px] font-medium text-white hover:bg-sky-500'
      >
        <Save className='size-3.5' aria-hidden />
        Save as team
      </button>
      {open && (
        <div className='absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl'>
          <label className='text-[10px] text-slate-400'>
            Name (it goes to My teams)
            <input
              autoFocus
              data-testid='timeline-team-save-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  save();
                }
                if (event.key === 'Escape') {
                  setOpen(false);
                }
              }}
              className='mt-1 h-7 w-full rounded border border-slate-700/60 bg-slate-950/60 px-2 text-[11px] text-slate-100 focus:border-sky-500 focus:ring-0'
            />
          </label>
          <div className='mt-2 flex justify-end gap-1.5'>
            <button
              type='button'
              onClick={() => setOpen(false)}
              className='h-7 rounded-md border border-slate-700/60 px-3 text-[11px] text-slate-300 hover:bg-slate-800'
            >
              Cancel
            </button>
            <button
              type='button'
              data-testid='timeline-team-save-confirm'
              onClick={save}
              className='h-7 rounded-md bg-sky-600 px-3 text-[11px] font-medium text-white hover:bg-sky-500'
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
// The header's parts that do not follow the playhead: drawn again only
// when what they show changes, not on every frame of a playback. Function
// props are callbacks that do the same thing on every render.
const sameShownProps = <P extends object>(before: P, after: P): boolean =>
  (Object.keys(after) as (keyof P)[]).every(
    (key) =>
      typeof after[key] === 'function' || Object.is(before[key], after[key])
  );

// The title, Share, the team in edition's or saved team's button, and the
// scenario menu.
const HeaderTitle = memo(function HeaderTitle({
  duration,
  share,
  teamActions,
  scenarios,
  scenario,
  onScenarioChange,
}: Pick<
  TimelineHeaderProps,
  | 'duration'
  | 'share'
  | 'teamActions'
  | 'scenarios'
  | 'scenario'
  | 'onScenarioChange'
>) {
  return (
    <>
      <Sparkles className='size-5 text-sky-400' aria-hidden />
      <div>
        <h1 className='text-sm leading-tight font-semibold text-slate-50'>
          Simulation Inspector
        </h1>
        <p className='text-[10px] text-slate-400'>
          Genshin Impact · {formatNumber(duration)}s Combat Simulation
        </p>
      </div>
      {/* What is shared is the whole team: next to where it is picked. */}
      <div className='ml-auto'>
        <ShareMenu
          current={share.current}
          label={share.label}
          onImport={share.onImport}
        />
      </div>
      {teamActions?.kind === 'draft' && (
        <SaveTeamButton
          suggested={teamActions.suggested}
          onSave={teamActions.onSave}
        />
      )}
      {teamActions?.kind === 'mine' && (
        <button
          type='button'
          data-testid='timeline-team-delete'
          title={`Delete ${teamActions.name}`}
          onClick={() => {
            if (
              window.confirm(
                `Delete ${teamActions.name} and its rotation from this browser?`
              )
            ) {
              teamActions.onDelete();
            }
          }}
          className='flex h-8 items-center gap-1 rounded-md border border-slate-700/60 bg-slate-900/70 px-2 text-[11px] text-rose-300 hover:bg-rose-500/10'
        >
          <Trash2 className='size-3.5' aria-hidden />
          Delete team
        </button>
      )}
      <Select value={scenario} onValueChange={onScenarioChange}>
        <SelectTrigger
          aria-label='Simulation'
          data-testid='timeline-scenario'
          size='sm'
          className='w-64 border-slate-700/60 bg-slate-900/70 text-[11px] text-slate-100 dark:bg-slate-900/70'
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
    </>
  );
},
sameShownProps);

// The team button and the members' chips.
const HeaderMembers = memo(function HeaderMembers({
  members,
  onTeamChange,
  onMemberClick,
}: Pick<TimelineHeaderProps, 'members' | 'onTeamChange' | 'onMemberClick'>) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      <TeamPicker
        current={members.map((member) => member.characterId)}
        onApply={onTeamChange}
      />
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
  );
},
sameShownProps);

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
  simulating = false,
  scenarios,
  scenario,
  onScenarioChange,
  onMemberClick,
  onTeamChange,
  teamActions,
  share,
}: TimelineHeaderProps) => (
  <header className='flex shrink-0 flex-col gap-2'>
    <div className='flex items-center gap-2'>
      <HeaderTitle
        duration={duration}
        share={share}
        teamActions={teamActions}
        scenarios={scenarios}
        scenario={scenario}
        onScenarioChange={onScenarioChange}
      />
    </div>

    <div
      data-testid='timeline-header'
      className='flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/70 px-2 py-1.5'
    >
      <HeaderMembers
        members={members}
        onTeamChange={onTeamChange}
        onMemberClick={onMemberClick}
      />

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
          aria-busy={simulating}
          onClick={onSimulate}
          className='flex h-7 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-[11px] font-medium text-white shadow hover:bg-sky-500'
        >
          <Dices
            className={cn('size-3.5', simulating && 'animate-spin')}
            aria-hidden
          />
          {simulating ? 'Simulating…' : 'Simulate again'}
        </button>
      </div>
    </div>
  </header>
);

export default TimelineHeader;
