import * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldVariants } from '@/components/ui/input';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        fieldVariants(),
        'h-auto min-h-16 resize-none p-2',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
