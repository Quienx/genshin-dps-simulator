import BuildHeader from './BuildHeader';
import CharacterNormalRotation from './CharacterNormalRotation';
import CharacterSections from './characters/CharacterSections';
import EnemyDummyCard from './EnemyDummyCard';
import ResultsCard from './ResultsCard';
import RotationCard from './rotation/RotationCard';
import SimulationSettingsCard from './SimulationSettingsCard';
import { CHARACTERS, isCharacterId } from '../_lib/characters';
import { RotationSetting } from '../_lib/rotation/types';
import {
  switchCharacter,
  withArtifacts,
  withFlag,
  withNumber,
  withRotation,
} from '../_lib/simulationValues';
import { ArtifactBuild, Build, SimulationValues } from '../_lib/types';

type BuildWorkspaceProps = {
  build: Build;
  onValuesChange: (id: number, values: SimulationValues) => void;
  onRemove: (id: number) => void;
};

const BuildWorkspace = ({
  build,
  onValuesChange,
  onRemove,
}: BuildWorkspaceProps) => {
  const { id, values } = build;

  const handleCharacterChange = (characterId: string) => {
    if (!isCharacterId(characterId)) {
      return;
    }
    onValuesChange(id, switchCharacter(values, characterId));
  };

  const handleNumberChange = (name: string, value: string) => {
    onValuesChange(id, withNumber(values, name, value));
  };

  const handleFlagChange = (name: string, checked: boolean) => {
    onValuesChange(id, withFlag(values, name, checked));
  };

  const handleArtifactsChange = (artifacts: ArtifactBuild) => {
    onValuesChange(id, withArtifacts(values, artifacts));
  };

  const handleRotationChange = (rotation: RotationSetting | null) => {
    onValuesChange(id, withRotation(values, rotation));
  };

  const handleRemove = () => {
    onRemove(id);
  };

  return (
    <div data-testid={`build-workspace-${id}`} className='flex flex-col gap-4'>
      <BuildHeader
        buildId={id}
        character={values.character}
        onCharacterChange={handleCharacterChange}
        onRemove={handleRemove}
      />

      {CHARACTERS[values.character].rotation ? (
        <RotationCard build={build} onRotationChange={handleRotationChange} />
      ) : (
        <ResultsCard build={build} />
      )}

      <CharacterSections
        values={values}
        onNumberChange={handleNumberChange}
        onFlagChange={handleFlagChange}
        onArtifactsChange={handleArtifactsChange}
      />

      <div className='grid items-start gap-4 lg:grid-cols-2'>
        <SimulationSettingsCard
          values={values}
          onNumberChange={handleNumberChange}
          onFlagChange={handleFlagChange}
        />
        <EnemyDummyCard
          values={values}
          onNumberChange={handleNumberChange}
          onFlagChange={handleFlagChange}
        />
      </div>

      <CharacterNormalRotation build={build} onValuesChange={onValuesChange} />
    </div>
  );
};

export default BuildWorkspace;
