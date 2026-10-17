import { Play } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

import SimulationInspector from './SimulationInspector';
import TeamRotationCard from './TeamRotationCard';
import CharacterSections from '../characters/CharacterSections';
import CharacterSelect from '../CharacterSelect';
import EnemyDummyCard from '../EnemyDummyCard';
import NumberField from '../NumberField';
import SimulationSettingsCard from '../SimulationSettingsCard';
import { getCharacterData } from '../../_lib/characterData';
import { ENEMY_DUMMY_FIELD_NAMES } from '../../_lib/enemyDummy';
import { MAX_DURATION_SECONDS } from '../../_lib/frames';
import { iconUrl } from '../../_lib/genshinIcons';
import { RotationSetting } from '../../_lib/rotation/types';
import {
  withArtifacts,
  withFlag,
  withNumber,
} from '../../_lib/simulationValues';
import {
  buildDefaultTeam,
  buildMemberValues,
  INSPECTOR_TEST_IDS,
  isSoloTeamField,
  runTeam,
  TeamRun,
  TeamState,
} from '../../_lib/team';
import { ArtifactBuild } from '../../_lib/types';

// The inspector's members, with their defaults when not in the team.
const INSPECTOR_DEFAULTS = INSPECTOR_TEST_IDS.map(buildMemberValues);

// Numbers every member shares: the enemy and the run's length.
const SHARED_NUMBERS = new Set([...ENEMY_DUMMY_FIELD_NAMES, 'duration']);

// A party of four on one timeline: the rotation, then each member's build.
const TeamWorkspace = () => {
  const [team, setTeam] = useState<TeamState>(buildDefaultTeam);
  const [selected, setSelected] = useState(0);
  const member = team.members[selected];
  // The last Simulate run, and the team it ran (to tell when it is stale).
  const [outcome, setOutcome] = useState<{
    run: TeamRun;
    team: TeamState;
  } | null>(null);

  const simulate = () => setOutcome({ run: runTeam(team, 'random'), team });

  const handleRotationChange = useCallback((rotation: RotationSetting) => {
    setTeam((previous) => ({ ...previous, rotation }));
  }, []);

  const handleFillChange = useCallback((fillWhileWaiting: boolean) => {
    setTeam((previous) => ({ ...previous, fillWhileWaiting }));
  }, []);

  const handleSwapDelayChange = useCallback((swapDelayFrames: number) => {
    setTeam((previous) => ({ ...previous, swapDelayFrames }));
  }, []);

  const handleNumberChange = (name: string, value: string) =>
    setTeam((previous) => ({
      ...previous,
      members: previous.members.map((values, index) =>
        index === selected || SHARED_NUMBERS.has(name)
          ? withNumber(values, name, value)
          : values
      ),
    }));

  const handleFlagChange = (name: string, checked: boolean) =>
    setTeam((previous) => ({
      ...previous,
      members: previous.members.map((values, index) =>
        index === selected ? withFlag(values, name, checked) : values
      ),
    }));

  const handleArtifactsChange = (artifacts: ArtifactBuild) =>
    setTeam((previous) => ({
      ...previous,
      members: previous.members.map((values, index) =>
        index === selected ? withArtifacts(values, artifacts) : values
      ),
    }));

  // A new member keeps the run's length and enemy.
  const handleMemberChange = (characterId: string) => {
    const taken = team.members.some(
      (values, index) => index !== selected && values.character === characterId
    );
    if (taken) {
      return;
    }
    setTeam((previous) => ({
      ...previous,
      members: previous.members.map((values, index) => {
        if (index !== selected) {
          return values;
        }
        const fresh = buildMemberValues(characterId);
        return {
          ...fresh,
          numbers: {
            ...fresh.numbers,
            ...Object.fromEntries(
              Object.entries(values.numbers).filter(([name]) =>
                SHARED_NUMBERS.has(name)
              )
            ),
          },
        };
      }),
    }));
  };

  // The inspector runs these members with the team's builds.
  const inspectorMembers = useMemo(
    () =>
      INSPECTOR_TEST_IDS.map(
        (id, index) =>
          team.members.find((values) => values.character === id) ??
          INSPECTOR_DEFAULTS[index]
      ),
    [team.members]
  );

  return (
    <div data-testid='team-workspace' className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <div className='w-56 [&>div]:mt-0'>
          <NumberField
            field={{
              kind: 'number',
              section: 'rotation',
              name: 'duration',
              label: 'Simulation length (seconds)',
              min: 1,
              max: MAX_DURATION_SECONDS,
            }}
            value={team.members[0]?.numbers.duration ?? '60'}
            onValueChange={handleNumberChange}
          />
        </div>
        <Button data-testid='team-simulate' type='button' onClick={simulate}>
          <Play />
          Simulate team
        </Button>
      </div>

      <TeamRotationCard
        team={team}
        outcome={outcome && { run: outcome.run, stale: outcome.team !== team }}
        onRotationChange={handleRotationChange}
        onFillChange={handleFillChange}
        onSwapDelayChange={handleSwapDelayChange}
      />

      <SimulationInspector members={inspectorMembers} />

      <div
        role='tablist'
        aria-label='Team members'
        className='flex flex-wrap items-end gap-2'
      >
        {team.members.map((values, index) => {
          const character = getCharacterData(values.character);
          return (
            <Button
              key={values.character}
              type='button'
              role='tab'
              aria-selected={index === selected}
              variant={index === selected ? 'secondary' : 'ghost'}
              data-testid={`team-member-${values.character}`}
              className={cn('h-auto gap-2 py-1.5')}
              onClick={() => setSelected(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={iconUrl(character.icons.avatar)}
                alt=''
                width={28}
                height={28}
                className='rounded-full'
              />
              {character.name}
            </Button>
          );
        })}
        <div className='ml-auto w-56'>
          <CharacterSelect
            value={member.character}
            onValueChange={handleMemberChange}
          />
        </div>
      </div>

      <CharacterSections
        values={member}
        onNumberChange={handleNumberChange}
        onFlagChange={handleFlagChange}
        onArtifactsChange={handleArtifactsChange}
      />

      <div className='grid items-start gap-4 lg:grid-cols-2'>
        <SimulationSettingsCard
          values={member}
          onNumberChange={handleNumberChange}
          onFlagChange={handleFlagChange}
          hideField={isSoloTeamField}
        />
        <EnemyDummyCard
          values={member}
          onNumberChange={handleNumberChange}
          onFlagChange={handleFlagChange}
        />
      </div>
    </div>
  );
};

export default TeamWorkspace;
