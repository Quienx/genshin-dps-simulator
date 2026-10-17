import { PLOT_HEIGHT, PLOT_WIDTH } from '../_lib/hitTimeline';
import { HitLogEntry } from '../_lib/types';

type HitTimelineBarProps = {
  hit: HitLogEntry;
  color: string;
  domainEnd: number;
  damageMax: number;
  dimmed: boolean;
};

const BAR_WIDTH = 3;

const getBarOpacity = (dimmed: boolean): number => {
  if (dimmed) {
    return 0.3;
  }
  return 1;
};

const HitTimelineBar = ({
  hit,
  color,
  domainEnd,
  damageMax,
  dimmed,
}: HitTimelineBarProps) => {
  const height = (hit.damage / Math.max(1, damageMax)) * PLOT_HEIGHT;
  const center = (hit.time / domainEnd) * PLOT_WIDTH;

  return (
    <rect
      data-testid={`hit-timeline-bar-${hit.index}`}
      x={center - BAR_WIDTH / 2}
      y={PLOT_HEIGHT - height}
      width={BAR_WIDTH}
      height={height}
      fill={color}
      opacity={getBarOpacity(dimmed)}
    />
  );
};

export default HitTimelineBar;
