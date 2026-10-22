import * as React from 'react';

import { withClassName } from '@/lib/utils';

const HEIGHTS = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

type MeterProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  // How full, out of `max` (1 by default); clamped to the bar.
  value: number;
  max?: number;
  size?: keyof typeof HEIGHTS;
  // The fill's color (a `bg-*` class, or a gradient).
  indicatorClassName?: string;
};

const TRACKS = {
  xs: 'block overflow-hidden rounded-full bg-accent/70 h-1',
  sm: 'block overflow-hidden rounded-full bg-accent/70 h-1.5',
  md: 'block overflow-hidden rounded-full bg-accent/70 h-2',
} as const;

const shareOf = (value: number, max: number) =>
  max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

// A thin bar that fills up to a value: a timer, a resource, HP. A span, so
// it fits inside text; its width comes from the className. It shows a
// value written beside it (or in its aria-label), so it is not a meter to
// assistive tech: a role whose value changes on every playhead move makes
// the browser rebuild its accessibility tree on every frame.
function Meter({
  value,
  max = 1,
  size = 'xs',
  className,
  indicatorClassName,
  ...props
}: MeterProps) {
  const share = shareOf(value, max);
  return (
    <span
      data-slot='meter'
      className={withClassName(TRACKS[size], className)}
      {...props}
    >
      {/* The whole bar, slid out to the left by what is missing: a moving
          value only changes its transform (no layout on every frame). */}
      <span
        className={withClassName(
          'block h-full rounded-full bg-primary',
          indicatorClassName
        )}
        style={{ transform: `translateX(${(share - 1) * 100}%)` }}
      />
    </span>
  );
}

type SegmentedMeterProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  // How many segments are lit, out of `segments`.
  value: number;
  segments: number;
  size?: keyof typeof HEIGHTS;
  fillClassName?: string;
};

// A bar in segments, one lit per unit (stacks, charges).
function SegmentedMeter({
  value,
  segments,
  size = 'xs',
  className,
  fillClassName,
  ...props
}: SegmentedMeterProps) {
  const lit = withClassName(
    'h-full flex-1 rounded-full bg-primary',
    fillClassName
  );
  return (
    <span
      data-slot='segmented-meter'
      className={withClassName(`flex gap-0.5 ${HEIGHTS[size]}`, className)}
      {...props}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={
            index < value ? lit : 'h-full flex-1 rounded-full bg-accent/70'
          }
        />
      ))}
    </span>
  );
}

export { Meter, SegmentedMeter };
