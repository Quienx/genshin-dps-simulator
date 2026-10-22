'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// One option of a set that is on or off (`data-state=on`): a filter tab,
// a speed, a mode.
const toggleVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-muted-foreground transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        // No border; the one on is tinted with the accent.
        default:
          'rounded-md hover:bg-muted hover:text-foreground data-[state=on]:bg-brand-600/30 data-[state=on]:text-brand-50 data-[state=on]:ring-1 data-[state=on]:ring-brand-500/40',
        // Bordered; the one on is outlined in the accent.
        outline:
          'rounded border border-border hover:bg-muted hover:text-foreground data-[state=on]:border-brand-400/70 data-[state=on]:bg-brand-500/20 data-[state=on]:text-brand-100',
      },
      size: {
        sm: 'h-7 px-2.5 text-2xs',
        xs: 'h-6 px-2 text-2xs',
        '2xs': 'h-5 px-1.5 text-2xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({});

// A row of toggles. `type='single'` picks one: Radix lets the one on be
// clicked off (value ''), so a group that always has one should ignore
// '' in `onValueChange`. Arrow keys move between them.
function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot='toggle-group'
      className={cn('flex flex-wrap items-center gap-1', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const group = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot='toggle-group-item'
      className={cn(
        toggleVariants({
          variant: variant ?? group.variant,
          size: size ?? group.size,
        }),
        className
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem, toggleVariants };
