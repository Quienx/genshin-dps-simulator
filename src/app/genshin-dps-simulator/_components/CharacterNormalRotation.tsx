import NormalOnlyRotationCard from './NormalOnlyRotationCard';
import { CHARACTERS } from '../_lib/characters';
import { withFlag, withNumber } from '../_lib/simulationValues';
import { Build, SimulationValues } from '../_lib/types';

type CharacterNormalRotationProps = {
  build: Build;
  onValuesChange: (id: number, values: SimulationValues) => void;
};

const CharacterNormalRotation = ({
  build,
  onValuesChange,
}: CharacterNormalRotationProps) => {
  if (!CHARACTERS[build.values.character].hasNormalOnlyScenario) {
    return null;
  }

  const handleNumberChange = (name: string, value: string) => {
    onValuesChange(build.id, withNumber(build.values, name, value));
  };

  const handleFlagChange = (name: string, checked: boolean) => {
    onValuesChange(build.id, withFlag(build.values, name, checked));
  };

  return (
    <NormalOnlyRotationCard
      buildId={build.id}
      runId={build.outcome?.runId}
      values={build.values}
      simulatedContext={build.outcome?.normalOnlyContext ?? null}
      onNumberChange={handleNumberChange}
      onFlagChange={handleFlagChange}
    />
  );
};

export default CharacterNormalRotation;
