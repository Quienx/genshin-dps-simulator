import DamageMeter from './DamageMeter';
import { SimulationOutcome } from '../_lib/types';

type SimulationResultProps = {
  outcome: SimulationOutcome | null;
};

const SimulationResult = ({ outcome }: SimulationResultProps) => {
  if (!outcome) {
    return (
      <div
        data-testid='simulation-result'
        className='rounded-lg bg-muted px-3 py-2 text-sm'
      >
        Click “Simulate all”.
      </div>
    );
  }

  return (
    <div data-testid='simulation-result'>
      <DamageMeter
        data-testid='simulation-result-meter'
        context={outcome.context}
        durationSeconds={outcome.duration}
      />
    </div>
  );
};

export default SimulationResult;
