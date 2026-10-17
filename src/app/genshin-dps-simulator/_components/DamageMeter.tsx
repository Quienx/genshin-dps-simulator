import DamageShareBreakdown from './DamageShareBreakdown';
import ResultStatTile from './ResultStatTile';
import { formatMeterSeconds, getCategoryShares } from '../_lib/damageMeter';
import formatNumber from '../_lib/formatNumber';
import { getCritSuffix } from '../_lib/labels';
import { DamageContext } from '../_lib/types';

type DamageMeterProps = {
  context: DamageContext;
  durationSeconds: number;
  'data-testid'?: string;
};

const DamageMeter = ({
  context,
  durationSeconds,
  'data-testid': testId = 'damage-meter',
}: DamageMeterProps) => {
  const dps = context.totalDamage / Math.max(1, durationSeconds);
  const { highestHit } = context;

  return (
    <div
      data-testid={testId}
      className='grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
    >
      <div className='grid grid-cols-3 gap-2'>
        <ResultStatTile
          data-testid={`${testId}-dps`}
          label='DPS'
          value={formatNumber(Math.round(dps))}
          detail={formatMeterSeconds(durationSeconds)}
        />
        <ResultStatTile
          data-testid={`${testId}-total`}
          label='Total DMG'
          value={formatNumber(Math.round(context.totalDamage))}
          detail={`${context.totalHits} hits · ${context.totalCrits} CRITs`}
        />
        <ResultStatTile
          data-testid={`${testId}-highest-hit`}
          label='Highest hit'
          value={formatNumber(Math.round(highestHit?.damage ?? 0))}
          detail={`${highestHit?.category ?? ''} ${getCritSuffix(
            highestHit?.isCrit ?? false
          )}`}
        />
      </div>
      <DamageShareBreakdown categoryShares={getCategoryShares(context)} />
    </div>
  );
};

export default DamageMeter;
