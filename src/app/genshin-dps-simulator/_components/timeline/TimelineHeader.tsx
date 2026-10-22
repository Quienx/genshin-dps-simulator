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
import { memo, ReactNode, useCallback, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/ui/panel';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverFooter,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  <AvatarStack>
    {ids.map((id) => (
      <Avatar
        key={id}
        src={iconUrl(getLoadedCharacter(id).character.icons.avatar)}
        size={20}
        shape='circle'
        className='ring-1 ring-card'
      />
    ))}
  </AvatarStack>
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
  const toggle = (id: string) =>
    setPicked((ids) =>
      ids.includes(id)
        ? ids.filter((entry) => entry !== id)
        : ids.length < TEAM_MAX
        ? [...ids, id]
        : ids
    );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Each opening starts again from the team on screen.
        if (next) {
          setPicked(current);
          setListed(firstOf(current));
        }
        setOpen(next);
      }}
    >
      {/* As tall as the members' chips beside it. */}
      <PopoverTrigger asChild>
        <Button
          variant='secondary'
          size='xs'
          data-testid='timeline-team-picker'
          title='Pick the team'
          className='h-auto min-h-7 gap-1 self-stretch border-dashed border-input bg-muted/40 px-2 hover:border-brand-500/60'
        >
          <UserPlus className='size-4' aria-hidden />
          Team
        </Button>
      </PopoverTrigger>
      <PopoverContent data-testid='timeline-team-picker-panel' className='w-80'>
        <p className='mb-1.5 text-2xs text-subtle'>
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
                  'group relative flex flex-col overflow-hidden rounded-sm bg-paper text-left shadow transition disabled:opacity-30',
                  // Picked: a gold frame and glow, raised.
                  order >= 0
                    ? '-translate-y-0.5 ring-[3px] ring-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.55)]'
                    : 'ring-1 ring-border hover:ring-slate-300'
                )}
              >
                <span
                  className={cn(
                    'relative block aspect-square w-full rounded-br-md',
                    data.rarity >= 5
                      ? 'bg-gradient-to-br from-rarity-5-from to-rarity-5-to'
                      : 'bg-gradient-to-br from-rarity-4-from to-rarity-4-to'
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
                    <span className='absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-amber-300 text-2xs font-bold text-slate-900 shadow ring-1 ring-amber-100'>
                      {order + 1}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'truncate px-0.5 py-0.5 text-center text-2xs',
                    order >= 0
                      ? 'bg-amber-300 font-semibold text-slate-900'
                      : 'font-medium text-paper-ink'
                  )}
                >
                  {character.name}
                </span>
              </button>
            );
          })}
        </div>
        <PopoverFooter>
          <PopoverClose asChild>
            <Button variant='outline' size='xs'>
              Cancel
            </Button>
          </PopoverClose>
          <Button
            size='xs'
            data-testid='timeline-team-apply'
            disabled={picked.length === 0}
            onClick={() => {
              setOpen(false);
              onApply(picked);
            }}
          >
            Apply
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Each opening starts again from the members' names.
        if (next) {
          setName(suggested);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button size='sm' data-testid='timeline-team-save'>
          <Save aria-hidden />
          Save as team
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-64'>
        <label className='text-2xs text-subtle'>
          Name (it goes to My teams)
          <Input
            size='sm'
            autoFocus
            data-testid='timeline-team-save-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                save();
              }
            }}
            className='mt-1'
          />
        </label>
        <PopoverFooter>
          <PopoverClose asChild>
            <Button variant='outline' size='xs'>
              Cancel
            </Button>
          </PopoverClose>
          <Button
            size='xs'
            data-testid='timeline-team-save-confirm'
            onClick={save}
          >
            Save
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
};

// Deletes a saved team, once confirmed.
const DeleteTeamButton = ({
  name,
  onDelete,
}: {
  name: string;
  onDelete: () => void;
}) => {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        variant='destructive-outline'
        size='sm'
        data-testid='timeline-team-delete'
        title={`Delete ${name}`}
        onClick={() => setAsking(true)}
      >
        <Trash2 aria-hidden />
        Delete team
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        data-testid='timeline-team-delete-dialog'
        confirmTestId='timeline-team-delete-confirm'
        title={`Delete ${name}?`}
        description='Its rotation is deleted from this browser too.'
        confirmLabel='Delete'
        destructive
        onConfirm={onDelete}
      />
    </>
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
  <Button
    variant='secondary'
    size='icon-sm'
    aria-label={label}
    title={label}
    onClick={onClick}
    className='text-foreground'
  >
    {children}
  </Button>
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
      <Sparkles className='size-5 text-brand-400' aria-hidden />
      <div>
        <h1 className='text-base leading-tight font-semibold text-foreground'>
          Combat Timeline
        </h1>
        <p className='text-2xs text-subtle'>
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
        <DeleteTeamButton
          name={teamActions.name}
          onDelete={teamActions.onDelete}
        />
      )}
      <Select value={scenario} onValueChange={onScenarioChange}>
        <SelectTrigger
          aria-label='Simulation'
          data-testid='timeline-scenario'
          size='sm'
          className='w-64'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align='end'>
          {SCENARIO_GROUPS.map((group) => {
            const entries = scenarios.filter(
              (entry) => entry.group === group.id
            );
            return entries.length === 0 ? null : (
              <SelectGroup key={group.id}>
                <SelectLabel>{group.label}</SelectLabel>
                {entries.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={entry.id}
                    data-testid={`timeline-scenario-${entry.id}`}
                    className='text-2xs'
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
          className='relative flex items-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted/60 py-0.5 pr-3 pl-2 text-left transition hover:border-brand-500/50 hover:bg-accent/60'
        >
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 w-1',
              member.color?.bar ?? 'bg-slate-500'
            )}
          />
          <Avatar src={member.avatar} size={28} className='bg-accent' />
          <div className='leading-tight'>
            <p className='text-2xs text-foreground'>{member.name}</p>
            <p className='text-2xs text-subtle'>Lv. 90</p>
          </div>
        </button>
      ))}
    </div>
  );
},
sameShownProps);

// Play, pause and step: drawn again only when playing starts or stops.
const PlayerButtons = memo(function PlayerButtons({
  playing,
  onTogglePlay,
  onStep,
}: Pick<TimelineHeaderProps, 'playing' | 'onTogglePlay' | 'onStep'>) {
  return (
    <div className='flex items-center gap-1 border-l border-border pl-2.5'>
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
  );
},
sameShownProps);

const SpeedToggle = memo(function SpeedToggle({
  speed,
  onSpeedChange,
}: Pick<TimelineHeaderProps, 'speed' | 'onSpeedChange'>) {
  return (
    <ToggleGroup
      type='single'
      size='2xs'
      aria-label='Playback speed'
      value={String(speed)}
      onValueChange={(value) => {
        // Clicking the speed on again unpicks it (''): one stays.
        if (value) {
          onSpeedChange(Number(value));
        }
      }}
    >
      {SPEEDS.map((value) => (
        <ToggleGroupItem key={value} value={String(value)}>
          {value}×
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
},
sameShownProps);

// Zoom, Fit and Simulate again.
const ViewControls = memo(function ViewControls({
  onZoom,
  onFit,
  onSimulate,
  simulating = false,
}: Pick<
  TimelineHeaderProps,
  'onZoom' | 'onFit' | 'onSimulate' | 'simulating'
>) {
  return (
    <div className='ml-auto flex items-center gap-1.5'>
      <div className='flex items-center gap-1 rounded-lg border border-border bg-muted/60 py-0.5 pr-0.5 pl-2.5 text-2xs text-muted-foreground'>
        Zoom
        <Button
          variant='ghost'
          size='icon-xs'
          aria-label='Zoom out'
          onClick={() => onZoom(-1)}
        >
          <Minus />
        </Button>
        <Button
          variant='ghost'
          size='icon-xs'
          aria-label='Zoom in'
          onClick={() => onZoom(1)}
        >
          <Plus />
        </Button>
      </div>
      <Button variant='secondary' size='xs' onClick={onFit} className='px-3'>
        Fit
      </Button>
      <Button
        size='xs'
        data-testid='timeline-simulate'
        aria-busy={simulating}
        onClick={onSimulate}
        className='px-3 shadow'
      >
        <Dices className={cn(simulating && 'animate-spin')} aria-hidden />
        {simulating ? 'Simulating…' : 'Simulate again'}
      </Button>
    </div>
  );
},
sameShownProps);

// The same function on every render, calling the latest one it was given:
// for the memoized controls, whose callbacks the page makes anew each time
// (Fit reads the width, Simulate the team) and must not go stale.
const useLatestCallback = <A extends unknown[]>(
  callback: (...args: A) => void
) => {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback((...args: A) => latest.current(...args), []);
};

const TimelineHeader = ({
  members,
  duration,
  time,
  playing,
  speed,
  onTogglePlay: togglePlay,
  onStep: step,
  onSpeedChange: changeSpeed,
  onSeek,
  onZoom: zoom,
  onFit: fit,
  onSimulate: simulate,
  simulating = false,
  scenarios,
  scenario,
  onScenarioChange,
  onMemberClick,
  onTeamChange,
  teamActions,
  share,
}: TimelineHeaderProps) => {
  const onTogglePlay = useLatestCallback(togglePlay);
  const onStep = useLatestCallback(step);
  const onSpeedChange = useLatestCallback(changeSpeed);
  const onZoom = useLatestCallback(zoom);
  const onFit = useLatestCallback(fit);
  const onSimulate = useLatestCallback(simulate);
  return (
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

      <Panel
        as='div'
        data-testid='timeline-header'
        className='flex flex-wrap items-center gap-2.5 px-2 py-1.5'
      >
        <HeaderMembers
          members={members}
          onTeamChange={onTeamChange}
          onMemberClick={onMemberClick}
        />

        <PlayerButtons
          playing={playing}
          onTogglePlay={onTogglePlay}
          onStep={onStep}
        />

        {/* The clock and the slider: the only part of the bar redrawn as
          the playhead moves. */}
        <div className='flex min-w-64 flex-1 flex-col gap-1 border-l border-border pl-2.5'>
          <div className='flex items-center gap-1'>
            <SpeedToggle speed={speed} onSpeedChange={onSpeedChange} />
            <span
              data-testid='timeline-time'
              className='ml-2 font-mono text-2xs text-foreground tabular-nums'
            >
              {time.toFixed(3)} s{' '}
              <span className='text-subtle'>/ {formatNumber(duration)} s</span>
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
            className='h-1 w-full cursor-pointer accent-brand-500'
          />
        </div>

        <ViewControls
          onZoom={onZoom}
          onFit={onFit}
          onSimulate={onSimulate}
          simulating={simulating}
        />
      </Panel>
    </header>
  );
};

export default TimelineHeader;
