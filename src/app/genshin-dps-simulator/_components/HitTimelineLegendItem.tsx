import SeriesSwatch from './SeriesSwatch';
import { HitSeries } from '../_lib/hitTimeline';
import { toTestIdSlug } from '../_lib/labels';

type HitTimelineLegendItemProps = {
  series: HitSeries;
};

const HitTimelineLegendItem = ({ series }: HitTimelineLegendItemProps) => (
  <li
    data-testid={`hit-timeline-legend-item-${toTestIdSlug(series.key)}`}
    className='flex items-center gap-1.5 whitespace-nowrap'
  >
    <SeriesSwatch color={series.color} />
    {series.label}
  </li>
);

export default HitTimelineLegendItem;
