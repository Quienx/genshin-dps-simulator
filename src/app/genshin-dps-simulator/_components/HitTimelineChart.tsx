import { MouseEvent, useMemo, useState } from 'react';

import HitTimelineBar from './HitTimelineBar';
import HitTimelineGridLine from './HitTimelineGridLine';
import HitTimelineLegendItem from './HitTimelineLegendItem';
import HitTimelineMaxLabel from './HitTimelineMaxLabel';
import HitTimelineMaxLine from './HitTimelineMaxLine';
import HitTimelineTooltip from './HitTimelineTooltip';
import HitTimelineXTick from './HitTimelineXTick';
import HitTimelineYTick from './HitTimelineYTick';
import {
  findNearestHit,
  getColorByCategory,
  getDamageTicks,
  getHighestDamage,
  getHitSeries,
  getTimeDomainEnd,
  getTimeTicks,
  PLOT_HEIGHT,
  PLOT_WIDTH,
} from '../_lib/hitTimeline';
import { HitLogEntry } from '../_lib/types';

type HitTimelineChartProps = {
  hits: HitLogEntry[];
  categories: string[];
};

const FALLBACK_COLOR = '#71717a';

const isDimmed = (
  hit: HitLogEntry,
  hoveredHit: HitLogEntry | null
): boolean => {
  if (!hoveredHit) {
    return false;
  }
  return hit.index !== hoveredHit.index;
};

const HitTimelineChart = ({ hits, categories }: HitTimelineChartProps) => {
  const [hoveredHit, setHoveredHit] = useState<HitLogEntry | null>(null);

  const series = useMemo(() => getHitSeries(categories), [categories]);
  const colorByCategory = useMemo(() => getColorByCategory(series), [series]);
  const domainEnd = getTimeDomainEnd(hits);
  const highestDamage = getHighestDamage(hits);
  const damageTicks = getDamageTicks(highestDamage);
  const damageMax = damageTicks[damageTicks.length - 1] ?? 1;

  const getColor = (category: string): string =>
    colorByCategory[category] ?? FALLBACK_COLOR;

  const handlePointerMove = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    setHoveredHit(findNearestHit(hits, ratio * domainEnd));
  };

  const clearHoveredHit = () => {
    setHoveredHit(null);
  };

  if (hits.length === 0) {
    return null;
  }

  return (
    <section data-testid='hit-timeline-chart' className='px-3 pb-3'>
      <div className='mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <h3 className='text-xs font-semibold'>DMG per hit over time</h3>
        <ul
          data-testid='hit-timeline-chart-legend'
          className='flex flex-wrap gap-x-4 gap-y-1 text-[11px]'
        >
          {series.map((entry) => (
            <HitTimelineLegendItem key={entry.key} series={entry} />
          ))}
        </ul>
      </div>

      <div className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-2'>
        <div className='relative h-40 w-9'>
          {damageTicks.map((value) => (
            <HitTimelineYTick
              key={value}
              value={value}
              ratio={value / damageMax}
            />
          ))}
        </div>

        <div
          data-testid='hit-timeline-chart-plot'
          className='relative h-40 cursor-crosshair text-foreground'
          onMouseMove={handlePointerMove}
          onMouseLeave={clearHoveredHit}
        >
          <svg
            aria-label='DMG of each hit over the simulation time'
            role='img'
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
            preserveAspectRatio='none'
            className='absolute inset-0 size-full overflow-visible'
          >
            {damageTicks.map((value) => (
              <HitTimelineGridLine key={value} ratio={value / damageMax} />
            ))}
            {hits.map((hit) => (
              <HitTimelineBar
                key={hit.index}
                hit={hit}
                color={getColor(hit.category)}
                domainEnd={domainEnd}
                damageMax={damageMax}
                dimmed={isDimmed(hit, hoveredHit)}
              />
            ))}
            <HitTimelineMaxLine ratio={highestDamage / damageMax} />
          </svg>
          <HitTimelineMaxLabel
            damage={highestDamage}
            ratio={highestDamage / damageMax}
          />
          <HitTimelineTooltip
            hit={hoveredHit}
            color={getColor(hoveredHit?.category ?? '')}
            domainEnd={domainEnd}
          />
        </div>

        <div />
        <div className='relative mt-1 h-4'>
          {getTimeTicks(domainEnd).map((seconds) => (
            <HitTimelineXTick
              key={seconds}
              seconds={seconds}
              domainEnd={domainEnd}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HitTimelineChart;
