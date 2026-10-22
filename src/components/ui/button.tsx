import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// The app's buttons. A toggle sets `aria-pressed` and gets its pressed
// look from the variant: a secondary one turns primary, a ghost one tints.
// A disabled one still gets the pointer, so its title can say why.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md whitespace-nowrap transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          'bg-primary font-medium text-primary-foreground shadow-xs hover:not-disabled:bg-brand-500',
        destructive:
          'bg-destructive font-medium text-white shadow-xs hover:not-disabled:bg-rose-500 focus-visible:ring-destructive/40',
        // A destructive action that is not the main one (Delete team).
        'destructive-outline':
          'border border-border bg-panel text-rose-300 hover:not-disabled:bg-rose-500/10 focus-visible:ring-destructive/40',
        secondary:
          'border border-border bg-muted/60 text-muted-foreground hover:not-disabled:bg-accent/70 hover:not-disabled:text-foreground aria-pressed:border-brand-500/60 aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-brand-500',
        outline:
          'border border-border text-muted-foreground hover:not-disabled:bg-muted hover:not-disabled:text-foreground',
        ghost:
          'text-muted-foreground hover:not-disabled:bg-muted hover:not-disabled:text-foreground aria-pressed:bg-brand-600/40 aria-pressed:text-brand-50 aria-pressed:hover:bg-brand-600/50',
        link: 'text-brand-300 underline-offset-4 hover:not-disabled:underline',
      },
      size: {
        default: "h-9 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-10 px-6 text-sm [&_svg:not([class*='size-'])]:size-4",
        sm: 'h-8 px-2.5 text-xs',
        // The toolbars' size.
        xs: 'h-7 px-2.5 text-2xs',
        // Inside a row of controls: steppers, the speeds.
        '2xs': 'h-6 gap-0.5 rounded px-1.5 text-2xs',
        icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
        'icon-sm': 'size-7',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot='button'
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
