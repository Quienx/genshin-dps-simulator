import DamageMeter from './DamageMeter';
import formatNumber from '../_lib/formatNumber';
import { DamageContext } from '../_lib/types';

type NormalOnlySimulationSummaryProps = {
  context: DamageContext | null;
  rotationSeconds: number;
  expectedDamage: number;
};

const getDifferenceFromExpected = (
  simulatedDamage: number,
  expectedDamage: number
): number => {
  if (expectedDamage <= 0) {
    return 0;
  }
  return (simulatedDamage / expectedDamage - 1) * 100;
};

const NormalOnlySimulationSummary = ({
  context,
  rotationSeconds,
  expectedDamage,
}: NormalOnlySimulationSummaryProps) => {
  if (!context) {
    return (
      <div
        data-testid='normal-only-simulation-summary'
        className='mt-3 rounded-lg bg-muted p-3 text-sm'
      >
        Click “Simulate all” to run every hit of the rotation.
      </div>
    );
  }

  return (
    <div data-testid='normal-only-simulation-summary'>
      <DamageMeter
        data-testid='normal-only-simulation-summary-meter'
        context={context}
        durationSeconds={rotationSeconds}
      />
      <p
        data-testid='normal-only-simulation-summary-difference'
        className='mt-2 text-xs text-muted-foreground'
      >
        {context.totalHits} hits, {context.totalCrits} CRIT. Difference from the
        expected average:{' '}
        {formatNumber(
          getDifferenceFromExpected(context.totalDamage, expectedDamage)
        )}
        %
      </p>
    </div>
  );
};

export default NormalOnlySimulationSummary;
