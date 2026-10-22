import * as React from 'react';

import { cn } from '@/lib/utils';

type BoxProps = React.HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'aside' | 'div';
};

// The box a part of the page sits in (a toolbar, a list, a side panel).
function Panel({ as: Tag = 'section', className, ...props }: BoxProps) {
  return (
    <Tag
      data-slot='panel'
      className={cn('rounded-xl border border-border bg-panel', className)}
      {...props}
    />
  );
}

// A box inside a panel, sunk into it: a group of the panel's content.
function Inset({ as: Tag = 'section', className, ...props }: BoxProps) {
  return (
    <Tag
      data-slot='inset'
      className={cn(
        'rounded-lg border border-border bg-sunken/50 p-2.5',
        className
      )}
      {...props}
    />
  );
}

export { Inset, Panel };
