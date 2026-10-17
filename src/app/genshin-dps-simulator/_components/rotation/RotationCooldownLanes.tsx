import { cn } from '@/lib/utils';

import RotationActionIcon from './RotationActionIcon';
import formatNumber from '../../_lib/formatNumber';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import {
  getTimelineX,
  TimelineLayout,
} from '../../_lib/rotation/timelineLayout';
import { CooldownLane } from '../../_lib/rotation/timeStrip';

type RotationCooldownLanesProps = {
  lanes: CooldownLane[];
  layout: TimelineLayout;
  duration: number;
  actions: RotationAction[];
};

const LINE_HEIGHT = 26;
const ICON_SIZE = 18;

const LANE_LABELS: Record<CooldownLane['kind'], string> = {
  skill: 'E',
  burst: 'Q',
};

// Under the rotation pieces, on the same scale: each plain E / Q of the
// first pass is a bar from where its piece starts until its cooldown ends
// (one line per charge), so you see which piece it is ready again under.
const RotationCooldownLanes = ({
  lanes,
  layout,
  duration,
  actions,
}: RotationCooldownLanesProps) => {
  const firstPassEnd = layout.tail?.from ?? duration;
  const toX = (time: number) => getTimelineX(layout, time, duration);

  return (
    <div data-testid='rotation-cooldown-lanes' className='mt-2 space-y-1'>
      {lanes.map((lane) => {
        const laneAction = actions.find((action) => action.id === lane.kind);
        const bars = lane.bars.filter((bar) => bar.start < firstPassEnd);
        return (
          <div
            key={lane.kind}
            data-testid={`rotation-cooldown-lane-${lane.kind}`}
            className='relative rounded-sm bg-muted/40'
            style={{ height: lane.charges * LINE_HEIGHT + 4 }}
          >
            {bars.map((bar) => {
              const left = toX(bar.start);
              return (
                <div
                  key={`${bar.start}-${bar.charge}`}
                  className={cn(
                    'absolute flex items-center overflow-hidden rounded border px-0.5',
                    // Purple, semi-transparent like the pieces, dark edge.
                    'border-zinc-900/70 bg-purple-500/20 text-purple-700 dark:border-black/70 dark:text-purple-300'
                  )}
                  style={{
                    left,
                    width: Math.max(ICON_SIZE + 6, toX(bar.end) - left),
                    top: 2 + bar.charge * LINE_HEIGHT,
                    height: LINE_HEIGHT - 2,
                  }}
                  title={`${bar.label}: used at ${formatNumber(
                    bar.start
                  )} s, ready again at ${formatNumber(bar.end)} s`}
                >
                  {laneAction && (
                    <RotationActionIcon action={laneAction} size={ICON_SIZE} />
                  )}
                </div>
              );
            })}
            {/* The lane's name stays in view while the track scrolls. */}
            <span className='sticky left-0 z-[2] inline-flex h-full items-center'>
              <span className='rounded-r bg-background/90 px-1 text-[10px] font-semibold'>
                {LANE_LABELS[lane.kind]}
                {lane.charges > 1 && (
                  <span className='font-normal text-muted-foreground'>
                    {' '}
                    ×{lane.charges}
                  </span>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default RotationCooldownLanes;
