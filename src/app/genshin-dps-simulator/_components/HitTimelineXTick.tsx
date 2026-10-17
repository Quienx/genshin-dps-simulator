type HitTimelineXTickProps = {
  seconds: number;
  domainEnd: number;
};

const HitTimelineXTick = ({ seconds, domainEnd }: HitTimelineXTickProps) => (
  <span
    data-testid={`hit-timeline-x-tick-${seconds}`}
    className='absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums'
    style={{ left: `${(seconds / domainEnd) * 100}%` }}
  >
    {seconds}s
  </span>
);

export default HitTimelineXTick;
