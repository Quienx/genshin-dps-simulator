import { DamageGain } from '../_lib/constellationGains';
import formatNumber from '../_lib/formatNumber';

type DamageGainTextProps = {
  gain: DamageGain;
  'data-testid'?: string;
};

const hasNoGain = (gain: DamageGain): boolean => Math.abs(gain.dps) < 0.5;

const formatSigned = (value: number): string => {
  if (value < 0) {
    return `−${formatNumber(Math.abs(value))}`;
  }
  return `+${formatNumber(value)}`;
};

const DamageGainText = ({
  gain,
  'data-testid': testId = 'damage-gain-text',
}: DamageGainTextProps) => {
  if (hasNoGain(gain)) {
    return (
      <span data-testid={testId} className='text-muted-foreground'>
        No DPS gain
      </span>
    );
  }

  return (
    <span data-testid={testId} className='font-semibold text-primary'>
      {formatSigned(Number(gain.percent.toFixed(1)))}% DPS{' '}
      <span className='font-normal text-muted-foreground'>
        ({formatSigned(Math.round(gain.dps))} DPS)
      </span>
    </span>
  );
};

export default DamageGainText;
