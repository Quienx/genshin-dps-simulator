import { PLOT_HEIGHT, PLOT_WIDTH } from '../_lib/hitTimeline';

type HitTimelineGridLineProps = {
  ratio: number;
};

const getLineOpacity = (ratio: number): number => {
  if (ratio === 0) {
    return 0.3;
  }
  return 0.08;
};

const HitTimelineGridLine = ({ ratio }: HitTimelineGridLineProps) => {
  const y = PLOT_HEIGHT - ratio * PLOT_HEIGHT;
  return (
    <line
      data-testid='hit-timeline-grid-line'
      x1={0}
      x2={PLOT_WIDTH}
      y1={y}
      y2={y}
      stroke='currentColor'
      strokeOpacity={getLineOpacity(ratio)}
      vectorEffect='non-scaling-stroke'
    />
  );
};

export default HitTimelineGridLine;
