import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { withClassName } from '@/lib/utils';

// An avatar's look. Long lists redrawn as the playhead moves (the combat
// log's rows, the event's blocks) put these classes on a plain <img>
// instead of mounting an Avatar per row.
const avatarVariants = cva('shrink-0 object-cover', {
  variants: {
    shape: {
      circle: 'rounded-full',
      rounded: 'rounded-md',
      square: 'rounded-none',
    },
    // A glyph (an element, an icon) sits on nothing; a portrait on a
    // muted tile while it loads.
    tile: { true: 'bg-muted', false: '' },
    // A faint ring around it, to set it apart from the background.
    ring: { true: 'ring-1 ring-white/10', false: '' },
  },
  defaultVariants: { shape: 'rounded', tile: true, ring: false },
});

type AvatarProps = Omit<React.ComponentProps<'img'>, 'width' | 'height'> &
  VariantProps<typeof avatarVariants> & {
    // Its side, in pixels.
    size: number;
  };

// A portrait or an icon (a character, a monster, an element), square and
// of a fixed size. Decorative by default: pass `alt` when it says
// something the text beside it does not.
function Avatar({
  src,
  size,
  shape,
  tile,
  ring,
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
      className={withClassName(
        avatarVariants({ shape, tile, ring }),
        className
      )}
      {...props}
    />
  );
}

const avatarStackVariants = cva('flex shrink-0 items-center', {
  variants: { overlap: { sm: '-space-x-1', md: '-space-x-1.5' } },
  defaultVariants: { overlap: 'md' },
});

// Avatars in a row, overlapping a little (a team's faces).
function AvatarStack({
  overlap,
  className,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof avatarStackVariants>) {
  return (
    <span
      data-slot='avatar-stack'
      className={withClassName(avatarStackVariants({ overlap }), className)}
      {...props}
    />
  );
}

export { Avatar, AvatarStack, avatarStackVariants, avatarVariants };
