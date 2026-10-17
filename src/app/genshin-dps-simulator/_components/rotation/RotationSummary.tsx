import { cn } from '@/lib/utils';

import formatNumber from '../../_lib/formatNumber';

type RotationSummaryProps = {
  dps: number;
  // Shown for custom rotations, to compare against the automatic logic.
  automaticDps?: number;
  warnings: number;
  // Seconds spent waiting for cooldowns, out of the run's duration.
  deadTime: number;
  duration: number;
};

const getDifferenceLabel = (custom: number, automatic: number) => {
  if (automatic <= 0) {
    return '';
  }
  const percent = ((custom - automatic) / automatic) * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${formatNumber(percent)}%`;
};

const RotationSummary = ({
  dps,
  automaticDps,
  warnings,
  deadTime,
  duration,
}: RotationSummaryProps) => (
  <dl
    data-testid='rotation-summary'
    className='grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2 text-sm sm:grid-cols-4'
  >
    <div>
      <dt className='text-xs text-muted-foreground'>
        Expected DPS (average crits)
      </dt>
      <dd className='font-semibold tabular-nums'>
        {formatNumber(Math.round(dps))}
      </dd>
    </div>
    {automaticDps !== undefined && (
      <div>
        <dt className='text-xs text-muted-foreground'>Automatic</dt>
        <dd className='tabular-nums'>
          {formatNumber(Math.round(automaticDps))}
          <span
            className={cn(
              'ml-1 text-xs',
              dps < automaticDps
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {getDifferenceLabel(dps, automaticDps)}
          </span>
        </dd>
      </div>
    )}
    <div>
      <dt className='text-xs text-muted-foreground'>Warnings</dt>
      <dd className='tabular-nums'>{warnings}</dd>
    </div>
    <div data-testid='rotation-dead-time'>
      <dt className='text-xs text-muted-foreground'>
        Dead time (cooldown waits)
      </dt>
      <dd className='tabular-nums'>
        {formatNumber(Math.round(deadTime * 10) / 10)} s
        <span className='ml-1 text-xs text-muted-foreground'>
          (
          {formatNumber(
            Math.round((deadTime / Math.max(duration, 1)) * 1000) / 10
          )}
          %)
        </span>
      </dd>
    </div>
  </dl>
);

export default RotationSummary;
