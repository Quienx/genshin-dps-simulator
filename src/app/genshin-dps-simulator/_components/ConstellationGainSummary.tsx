import DamageGainText from './DamageGainText';
import { DamageGain } from '../_lib/constellationGains';

type ConstellationGainSummaryProps = {
  total: DamageGain;
};

const ConstellationGainSummary = ({ total }: ConstellationGainSummaryProps) => (
  <div
    data-testid='constellation-gain-summary'
    className='mb-4 rounded-lg border bg-muted p-3 text-sm'
  >
    <div className='flex flex-wrap items-baseline justify-between gap-2'>
      <span className='font-semibold'>C0 → C6 total</span>
      <DamageGainText
        data-testid='constellation-gain-summary-total'
        gain={total}
      />
    </div>
    <p className='mt-1 text-xs text-muted-foreground'>
      Each row shows what that constellation adds on top of the previous ones,
      with your current build and average CRIT damage.
    </p>
  </div>
);

export default ConstellationGainSummary;
