import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { withClassName } from '@/lib/utils';

// A small tag next to a name or a value: a count, a state, a level.
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-white',
        outline: 'border-border text-muted-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        // The accent, soft: what is picked, pinned or on.
        brand: 'border-transparent bg-brand-500/20 text-brand-100',
        warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      },
      size: {
        default: 'rounded-md px-2 py-0.5 text-xs',
        sm: 'rounded px-1.5 py-0.5 text-2xs',
        // Inside the chart and other tight spots.
        xs: 'rounded-sm px-1 py-px text-3xs leading-none',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot='badge'
      className={withClassName(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, type BadgeProps, badgeVariants };
