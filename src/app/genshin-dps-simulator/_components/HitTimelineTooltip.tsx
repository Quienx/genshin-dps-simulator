import SeriesSwatch from './SeriesSwatch';
import formatNumber from '../_lib/formatNumber';
import { getCritSuffix } from '../_lib/labels';
import { HitLogEntry } from '../_lib/types';

type HitTimelineTooltipProps = {
  hit: HitLogEntry | null;
  color: string;
  domainEnd: number;
};

const TOOLTIP_EDGE_PERCENT = 12;

const getTooltipLeftPercent = (time: number, domainEnd: number): number =>
  Math.min(
    100 - TOOLTIP_EDGE_PERCENT,
    Math.max(TOOLTIP_EDGE_PERCENT, (time / domainEnd) * 100)
  );

const HitTimelineTooltip = ({
  hit,
  color,
  domainEnd,
}: HitTimelineTooltipProps) => {
  if (!hit) {
    return null;
  }

  return (
    <div
      data-testid='hit-timeline-tooltip'
      className='pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-[11px] leading-snug whitespace-nowrap shadow-md'
      style={{ left: `${getTooltipLeftPercent(hit.time, domainEnd)}%` }}
    >
      <div className='flex items-center gap-1.5 font-semibold'>
        <SeriesSwatch color={color} />
        {hit.category}
        <span className='font-normal text-muted-foreground'>
          #{hit.index} · {hit.time.toFixed(2)}s
        </span>
      </div>
      <div className='tabular-nums'>
        <span className='font-semibold'>
          {formatNumber(Math.round(hit.damage))}
        </span>{' '}
        <span className='text-muted-foreground'>
          {getCritSuffix(hit.isCrit)} · {hit.element}
        </span>
      </div>
      <div className='text-muted-foreground tabular-nums'>
        Cumulative: {formatNumber(Math.round(hit.cumulativeDamage))}
      </div>
    </div>
  );
};

export default HitTimelineTooltip;
