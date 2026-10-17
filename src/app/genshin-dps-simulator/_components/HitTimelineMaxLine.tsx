import { PLOT_HEIGHT, PLOT_WIDTH } from '../_lib/hitTimeline';

type HitTimelineMaxLineProps = {
  ratio: number;
};

const HitTimelineMaxLine = ({ ratio }: HitTimelineMaxLineProps) => {
  const y = PLOT_HEIGHT - ratio * PLOT_HEIGHT;
  return (
    <line
      data-testid='hit-timeline-max-line'
      x1={0}
      x2={PLOT_WIDTH}
      y1={y}
      y2={y}
      stroke='currentColor'
      strokeOpacity={0.5}
      strokeDasharray='4 4'
      vectorEffect='non-scaling-stroke'
    />
  );
};

export default HitTimelineMaxLine;
