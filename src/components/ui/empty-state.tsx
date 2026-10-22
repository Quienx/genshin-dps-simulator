import * as React from 'react';

import { cn } from '@/lib/utils';

// What a list or a panel says while it has nothing to show.
function EmptyState({
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { icon?: React.ReactNode }) {
  return (
    <div
      data-slot='empty-state'
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-6 text-center text-xs text-subtle [&_svg]:size-5 [&_svg]:text-subtle/70',
        className
      )}
      {...props}
    >
      {icon}
      <p>{children}</p>
    </div>
  );
}

export { EmptyState };
