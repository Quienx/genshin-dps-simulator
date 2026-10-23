import { Dices, Save, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { memo, ReactNode, useState } from 'react';

import { cn } from '@/lib/utils';

import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/ui/panel';
import {
  Popover,
  PopoverAnchor,
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import ShareMenu from './ShareMenu';
import { SharedRotation } from './shareRotation';
import { sameShownProps } from './timelineData';
import useLatestCallback from './useLatestCallback';
import { getLoadedCharacter } from '../../_lib/characterData';
import { CHARACTER_LIST } from '../../_lib/characters';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl, iconUrl } from '../../_lib/genshinIcons';
import { CritMode } from '../../_lib/types';

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
  // The run's result (DPS, DMG and its breakdown), after the team.
  results?: ReactNode;
  // Runs the simulation again (new CRIT rolls).
  onSimulate: () => void;
  // A run is being played (the button says so).
  simulating?: boolean;
  // Each hit's average CRIT, or rolled (Roll again rolls them anew).
  critMode: CritMode;
  onCritModeChange: (mode: CritMode) => void;
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
// shows that team. Opened from the scenario menu ("Build a team…"),
// under it (`children`, its anchor).
const TeamPicker = ({
  current,
  onApply,
  open,
  onOpenChange,
  children,
}: {
  current: string[];
  onApply: (ids: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverAnchor asChild>{children}</PopoverAnchor>
    <PopoverContent
      data-testid='timeline-team-picker-panel'
      className='w-80'
      // The menu it opens from gives the focus back to its trigger as it
      // closes: that is not leaving the picker (a click outside or Esc is).
      onFocusOutside={(event) => event.preventDefault()}
    >
      {/* Mounted on each opening: it starts again from the team on
          screen. */}
      <TeamPickerCards
        current={current}
        onApply={(ids) => {
          onOpenChange(false);
          onApply(ids);
        }}
      />
    </PopoverContent>
  </Popover>
);

const TeamPickerCards = ({
  current,
  onApply,
}: {
  current: string[];
  onApply: (ids: string[]) => void;
}) => {
  const [picked, setPicked] = useState<string[]>(current);
  // The team's members first, as the game's party setup: set when the
  // menu opens, so the cards stay put while picking.
  const [listed] = useState<string[]>(() => [
    ...current,
    ...CHARACTER_LIST.map((character) => character.id).filter(
      (id) => !current.includes(id)
    ),
  ]);
  const toggle = (id: string) =>
    setPicked((ids) =>
      ids.includes(id)
        ? ids.filter((entry) => entry !== id)
        : ids.length < TEAM_MAX
        ? [...ids, id]
        : ids
    );
  return (
    <>
      <p className='mb-1.5 text-2xs text-subtle'>
        Up to {TEAM_MAX} characters, in the order you pick them. One alone plays
        its own rotation.
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
          onClick={() => onApply(picked)}
        >
          Apply
        </Button>
      </PopoverFooter>
    </>
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
      <PopoverContent align='start' className='w-64'>
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

// The title and Import / Export.
const HeaderTitle = memo(function HeaderTitle({
  duration,
  share,
}: Pick<TimelineHeaderProps, 'duration' | 'share'>) {
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
      <div className='ml-auto'>
        <ShareMenu
          current={share.current}
          label={share.label}
          onImport={share.onImport}
        />
      </div>
    </>
  );
},
sameShownProps);

// The menu's own entry (not a scenario): opens the team picker.
const BUILD_TEAM = '__build-team';

// The team: the scenario menu (a preset, a saved team, one character, or
// "Build a team…", which opens the picker under it), and the team in
// edition's or saved team's button.
const HeaderTeam = memo(function HeaderTeam({
  members,
  scenarios,
  scenario,
  onScenarioChange,
  onTeamChange,
  teamActions,
}: Pick<
  TimelineHeaderProps,
  | 'members'
  | 'scenarios'
  | 'scenario'
  | 'onScenarioChange'
  | 'onTeamChange'
  | 'teamActions'
>) {
  const [picking, setPicking] = useState(false);
  return (
    <div className='flex items-center gap-1.5'>
      <TeamPicker
        current={members.map((member) => member.characterId)}
        onApply={onTeamChange}
        open={picking}
        onOpenChange={setPicking}
      >
        <div>
          <Select
            value={scenario}
            onValueChange={(id) => {
              if (id === BUILD_TEAM) {
                // Once the menu has closed (it gives the focus back to
                // its trigger first).
                window.setTimeout(() => setPicking(true));
              } else {
                onScenarioChange(id);
              }
            }}
          >
            <SelectTrigger
              aria-label='Team'
              data-testid='timeline-scenario'
              size='sm'
              className='w-60'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align='start'>
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
              <SelectSeparator />
              <SelectItem
                value={BUILD_TEAM}
                data-testid='timeline-team-picker'
                className='text-2xs font-medium text-brand-200'
              >
                <UserPlus className='size-4 text-brand-300' aria-hidden />
                Build a team…
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TeamPicker>
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
    </div>
  );
},
sameShownProps);

// The members' chips: each opens its build.
const HeaderMembers = memo(function HeaderMembers({
  members,
  onMemberClick,
}: Pick<TimelineHeaderProps, 'members' | 'onMemberClick'>) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      {members.map((member) => (
        <button
          type='button'
          key={member.characterId}
          data-testid={`timeline-member-${member.characterId}`}
          title={`${member.name}: see the build`}
          aria-label={`${member.name}: see the build`}
          onClick={() => onMemberClick(member.characterId)}
          className='relative flex h-8 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted/60 pr-1 pl-2 text-left text-2xs text-foreground transition hover:border-brand-500/50 hover:bg-accent/60 2xl:pr-2.5'
        >
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 w-1',
              member.color?.bar ?? 'bg-slate-500'
            )}
          />
          <Avatar src={member.avatar} size={24} className='bg-accent' />
          {/* Narrower screens: the faces only (the name is in the tip). */}
          <span className='hidden 2xl:inline'>{member.name}</span>
        </button>
      ))}
    </div>
  );
},
sameShownProps);

// The CRIT mode, and Roll again when CRITs are rolled.
const CritControls = memo(function CritControls({
  onSimulate,
  simulating = false,
  critMode,
  onCritModeChange,
}: Pick<
  TimelineHeaderProps,
  'onSimulate' | 'simulating' | 'critMode' | 'onCritModeChange'
>) {
  return (
    <div className='flex items-center gap-1.5'>
      <div
        className='flex items-center gap-1 rounded-lg border border-border bg-muted/60 py-0.5 pr-0.5 pl-2.5 text-2xs text-muted-foreground'
        title='Average: every hit deals its average CRIT, so a rotation gives the same total every run. Rolled: each hit crits or not, by its CRIT Rate.'
      >
        CRIT
        <ToggleGroup
          type='single'
          size='2xs'
          aria-label='CRIT'
          data-testid='timeline-crit-mode'
          value={critMode}
          onValueChange={(value) => {
            if (value) {
              onCritModeChange(value as CritMode);
            }
          }}
        >
          <ToggleGroupItem value='expected'>Average</ToggleGroupItem>
          <ToggleGroupItem value='random'>Rolled</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {critMode === 'random' ? (
        <Button
          size='xs'
          data-testid='timeline-simulate'
          aria-busy={simulating}
          onClick={onSimulate}
          className='px-3 shadow'
        >
          <Dices className={cn(simulating && 'animate-spin')} aria-hidden />
          {simulating ? 'Simulating…' : 'Roll again'}
        </Button>
      ) : (
        simulating && (
          <span
            data-testid='timeline-simulating'
            className='flex items-center gap-1 px-1 text-2xs text-subtle'
          >
            <Dices className='size-3.5 animate-spin' aria-hidden />
            Simulating…
          </span>
        )
      )}
    </div>
  );
},
sameShownProps);

// The inspector's top bar: the team and its result (the player is the
// timeline panel's).
const TimelineHeader = ({
  members,
  duration,
  results,
  onSimulate: simulate,
  simulating = false,
  critMode,
  onCritModeChange: changeCritMode,
  scenarios,
  scenario,
  onScenarioChange,
  onMemberClick,
  onTeamChange,
  teamActions,
  share,
}: TimelineHeaderProps) => {
  const onSimulate = useLatestCallback(simulate);
  const onCritModeChange = useLatestCallback(changeCritMode);
  return (
    <header className='flex shrink-0 flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <HeaderTitle duration={duration} share={share} />
      </div>

      <Panel
        as='div'
        data-testid='timeline-header'
        className='flex flex-wrap items-center gap-2.5 px-2 py-1.5'
      >
        <HeaderTeam
          members={members}
          scenarios={scenarios}
          scenario={scenario}
          onScenarioChange={onScenarioChange}
          onTeamChange={onTeamChange}
          teamActions={teamActions}
        />
        <HeaderMembers members={members} onMemberClick={onMemberClick} />

        {/* The result, and how its CRITs were played. */}
        <div className='ml-auto flex flex-wrap items-center gap-2.5'>
          {results}
          <CritControls
            onSimulate={onSimulate}
            simulating={simulating}
            critMode={critMode}
            onCritModeChange={onCritModeChange}
          />
        </div>
      </Panel>
    </header>
  );
};

export default TimelineHeader;
