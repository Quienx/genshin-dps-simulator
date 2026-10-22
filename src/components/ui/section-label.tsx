import * as React from 'react';

import { cn } from '@/lib/utils';

// A small uppercase heading over a group: a menu's group, a section of a
// sheet or a tooltip.
function SectionLabel({
  as: Tag = 'p',
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'p' | 'h3' | 'h4' | 'span' }) {
  return (
    <Tag
      data-slot='section-label'
      className={cn(
        'text-2xs font-semibold tracking-wide text-subtle uppercase',
        className
      )}
      {...props}
    />
  );
}

export { SectionLabel };
