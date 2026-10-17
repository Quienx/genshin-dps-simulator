'use client';

import { Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

import BuildWorkspace from './BuildWorkspace';
import TeamWorkspace from './team/TeamWorkspace';
import { DEFAULT_CHARACTER_ID } from '../_lib/characters';
import runSimulation from '../_lib/runSimulation';
import { buildDefaultValues } from '../_lib/simulationValues';
import { Build, CharacterId, SimulationValues } from '../_lib/types';

type Mode = 'builds' | 'team';

const DEFAULT_CHARACTER: CharacterId = DEFAULT_CHARACTER_ID;

const createBuild = (id: number, characterId: CharacterId): Build => ({
  id,
  values: buildDefaultValues(characterId),
  outcome: null,
});

const replaceBuildValues = (
  build: Build,
  id: number,
  values: SimulationValues
): Build => {
  if (build.id !== id) {
    return build;
  }
  // Results of another character no longer belong to this build.
  const outcome =
    values.character === build.values.character ? build.outcome : null;
  return { ...build, values, outcome };
};

const DamageSimulator = () => {
  const nextBuildIdRef = useRef(2);
  const runCountRef = useRef(0);
  const [mode, setMode] = useState<Mode>('builds');
  // The team stays mounted (and keeps its state) once opened.
  const [teamOpened, setTeamOpened] = useState(false);
  const [builds, setBuilds] = useState<Build[]>(() => [
    createBuild(1, DEFAULT_CHARACTER),
  ]);

  const addBuild = () => {
    const id = nextBuildIdRef.current;
    nextBuildIdRef.current += 1;
    const characterId = builds[0]?.values.character ?? DEFAULT_CHARACTER;
    setBuilds((previous) => [...previous, createBuild(id, characterId)]);
  };

  const simulateAll = () => {
    runCountRef.current += 1;
    const runId = runCountRef.current;
    setBuilds(
      builds.map((build) => ({
        ...build,
        outcome: runSimulation(build.values, runId),
      }))
    );
  };

  const updateBuildValues = useCallback(
    (id: number, values: SimulationValues) => {
      setBuilds((previous) =>
        previous.map((build) => replaceBuildValues(build, id, values))
      );
    },
    []
  );

  const removeBuild = useCallback((id: number) => {
    setBuilds((previous) => previous.filter((build) => build.id !== id));
  }, []);

  return (
    <div
      data-testid='damage-simulator'
      className='h-dvh overflow-y-auto bg-background text-foreground'
    >
      <div className='px-4 py-8 lg:px-8'>
        <h1 className='text-2xl font-semibold'>
          Genshin Impact Damage Simulator
        </h1>

        <div
          data-testid='damage-simulator-mode'
          role='group'
          aria-label='Simulator mode'
          className='my-4 inline-flex rounded-md border p-0.5'
        >
          <Button
            type='button'
            size='sm'
            variant={mode === 'builds' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'builds'}
            onClick={() => setMode('builds')}
          >
            One character
          </Button>
          <Button
            type='button'
            size='sm'
            variant={mode === 'team' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'team'}
            onClick={() => {
              setMode('team');
              setTeamOpened(true);
            }}
          >
            Team
          </Button>
        </div>

        {teamOpened && (
          <div className={mode === 'team' ? undefined : 'hidden'}>
            <TeamWorkspace />
          </div>
        )}

        <div
          className={mode === 'team' ? 'hidden' : 'my-4 flex flex-wrap gap-2'}
        >
          <Button
            data-testid='damage-simulator-add'
            variant='secondary'
            onClick={addBuild}
          >
            <Plus />
            Add simulation
          </Button>
          <Button
            data-testid='damage-simulator-simulate-all'
            onClick={simulateAll}
          >
            Simulate all
          </Button>
        </div>

        <p
          data-testid='damage-simulator-note'
          className={
            mode === 'team'
              ? 'hidden'
              : 'mb-6 text-sm leading-relaxed text-muted-foreground'
          }
        >
          CRITs are random. The simulator applies the configured DEF, RES, DMG
          bonuses, stacks and reaction multipliers. Rotations and team buffs
          must be adjusted to your real setup; not every Genshin Impact mechanic
          is modeled automatically.
        </p>

        <div className={mode === 'team' ? 'hidden' : 'flex flex-col gap-10'}>
          {builds.map((build) => (
            <BuildWorkspace
              key={build.id}
              build={build}
              onValuesChange={updateBuildValues}
              onRemove={removeBuild}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DamageSimulator;
