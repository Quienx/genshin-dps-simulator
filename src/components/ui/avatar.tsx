import * as React from 'react';

import { cn } from '@/lib/utils';

const SHAPES = {
  circle: 'rounded-full',
  rounded: 'rounded-md',
  square: 'rounded-none',
} as const;

type AvatarProps = Omit<React.ComponentProps<'img'>, 'width' | 'height'> & {
  // Its side, in pixels.
  size: number;
  shape?: keyof typeof SHAPES;
  // A faint ring around it, to set it apart from the background.
  ring?: boolean;
};

// A portrait or an icon (a character, a monster, an element), square and
// of a fixed size, on a muted background while it loads. Decorative by
// default: pass `alt` when it says something the text beside it does not.
function Avatar({
  src,
  size,
  shape = 'rounded',
  ring = false,
  alt = '',
  className,
  style,
  ...props
}: AvatarProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-slot='avatar'
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size, ...style }}
      className={cn(
        'shrink-0 bg-muted object-cover',
        SHAPES[shape],
        ring && 'ring-1 ring-white/10',
        className
      )}
      {...props}
    />
  );
}

// Avatars in a row, overlapping a little (a team's faces).
function AvatarStack({
  overlap = 'md',
  className,
  ...props
}: React.ComponentProps<'span'> & { overlap?: 'sm' | 'md' }) {
  return (
    <span
      data-slot='avatar-stack'
      className={cn(
        'flex shrink-0 items-center',
        overlap === 'sm' ? '-space-x-1' : '-space-x-1.5',
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarStack };
