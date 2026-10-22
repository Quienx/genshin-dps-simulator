import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// A field's box: sunk into its panel, its border turning the accent while
// typing in it.
const fieldVariants = cva(
  'w-full min-w-0 rounded-md border border-border bg-sunken/60 text-foreground transition-colors outline-none placeholder:text-subtle focus:border-brand-500 focus:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-rose-500 aria-invalid:text-rose-300',
  {
    variants: {
      size: {
        default: 'h-8 px-2.5 text-xs',
        sm: 'h-7 px-2 text-2xs',
        xs: 'h-6 rounded px-1 text-2xs',
      },
    },
    defaultVariants: { size: 'default' },
  }
);

function Input({
  className,
  type,
  size,
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> &
  VariantProps<typeof fieldVariants>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(fieldVariants({ size }), className)}
      {...props}
    />
  );
}

export { fieldVariants, Input };
