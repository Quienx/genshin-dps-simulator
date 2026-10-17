import { memo, useMemo } from 'react';

import { countUpTo, samePanelProps } from './timelineData';
import formatNumber from '../../_lib/formatNumber';
import { InspectorView } from '../../_lib/inspector';

type DamageSummaryProps = {
  view: InspectorView;
  time: number;
};

// The DMG dealt up to the playhead, out of the whole run's, and the DPS
// so far. Only the counted duration (60 s) adds up: past it, both stay.
const DamageSummary = ({ view, time }: DamageSummaryProps) => {
  // Every hit's time and the total up to it (once per run): each frame
  // only looks the total up.
  const damage = useMemo(() => {
    const hits = view.hits
      .filter((hit) => hit.counted)
      .sort((a, b) => a.time - b.time);
    const times: number[] = [];
    const totals: number[] = [];
    let total = 0;
    hits.forEach((hit) => {
      total += hit.damage;
      times.push(hit.time);
      totals.push(total);
    });
    return { times, totals, total };
  }, [view]);
  const landed = countUpTo(damage.times, time + 1e-6);
  const dealt = landed > 0 ? damage.totals[landed - 1] : 0;
  const share = damage.total > 0 ? dealt / damage.total : 0;

  return (
    <section
      data-testid='timeline-damage'
      className='shrink-0 rounded-xl border border-slate-700/60 bg-slate-900/70 px-2.5 py-2'
    >
      <div className='flex items-baseline justify-between gap-2'>
        <h2 className='text-sm font-semibold text-slate-50'>Damage</h2>
        <span className='text-[10px] text-slate-400 tabular-nums'>
          {formatNumber(
            Math.round(
              time > 0 ? dealt / Math.min(time, view.countedDuration) : 0
            )
          )}{' '}
          DPS
        </span>
      </div>
      <p className='mt-1 text-xs text-slate-400 tabular-nums'>
        <span className='font-semibold text-amber-300'>
          {formatNumber(Math.round(dealt))}
        </span>{' '}
        / {formatNumber(Math.round(damage.total))}
        <span className='float-right text-slate-500'>
          {formatNumber(Math.round(share * 1000) / 10)}%
        </span>
      </p>
    </section>
  );
};

// It follows the playhead at most every PANEL_QUANTUM.
export default memo(DamageSummary, samePanelProps);
