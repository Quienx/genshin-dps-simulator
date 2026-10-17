import { formatCompactNumber } from '../_lib/hitTimeline';

type HitTimelineYTickProps = {
  value: number;
  ratio: number;
};

const HitTimelineYTick = ({ value, ratio }: HitTimelineYTickProps) => (
  <span
    data-testid={`hit-timeline-y-tick-${value}`}
    className='absolute right-0 translate-y-1/2 text-[10px] text-muted-foreground tabular-nums'
    style={{ bottom: `${ratio * 100}%` }}
  >
    {formatCompactNumber(value)}
  </span>
);

export default HitTimelineYTick;
