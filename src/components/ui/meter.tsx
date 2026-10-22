import * as React from 'react';

import { cn } from '@/lib/utils';

const HEIGHTS = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

type MeterProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  // How full, out of `max` (1 by default); clamped to the bar.
  value: number;
  max?: number;
  size?: keyof typeof HEIGHTS;
  // The fill's color (a `bg-*` class, or a gradient).
  indicatorClassName?: string;
};

const shareOf = (value: number, max: number) =>
  max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

// A thin bar that fills up to a value: a timer, a resource, HP. A span, so
// it fits inside text; its width comes from the className.
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
      role='meter'
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        'block overflow-hidden rounded-full bg-accent/70',
        HEIGHTS[size],
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'block h-full rounded-full bg-primary',
          indicatorClassName
        )}
        style={{ width: `${share * 100}%` }}
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
  return (
    <span
      data-slot='segmented-meter'
      role='meter'
      aria-valuemin={0}
      aria-valuemax={segments}
      aria-valuenow={value}
      className={cn('flex gap-0.5', HEIGHTS[size], className)}
      {...props}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-full flex-1 rounded-full',
            index < value ? cn('bg-primary', fillClassName) : 'bg-accent/70'
          )}
        />
      ))}
    </span>
  );
}

export { Meter, SegmentedMeter };
