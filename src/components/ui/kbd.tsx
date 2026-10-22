import * as React from 'react';

import { cn } from '@/lib/utils';

// A key, a gesture or a term set apart in a help text (`Ctrl`, `Drag`).
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot='kbd'
      className={cn(
        'mx-px rounded border border-input bg-muted px-1 py-px font-sans text-2xs font-medium whitespace-nowrap text-brand-200',
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
