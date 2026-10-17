import { formatCompactNumber } from '../_lib/hitTimeline';

type HitTimelineMaxLabelProps = {
  damage: number;
  ratio: number;
};

const HitTimelineMaxLabel = ({ damage, ratio }: HitTimelineMaxLabelProps) => (
  <span
    data-testid='hit-timeline-max-label'
    className='pointer-events-none absolute right-0 mb-0.5 rounded bg-background/80 px-1 text-[10px] text-muted-foreground tabular-nums'
    style={{ bottom: `${ratio * 100}%` }}
  >
    Max {formatCompactNumber(damage)}
  </span>
);

export default HitTimelineMaxLabel;
