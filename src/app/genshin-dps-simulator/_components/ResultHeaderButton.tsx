import { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const ResultHeaderButton = ({
  className,
  'data-testid': testId = 'result-header-button',
  ...props
}: ComponentProps<'button'> & { 'data-testid'?: string }) => (
  <button
    type='button'
    data-testid={testId}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-md border bg-muted px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors hover:bg-accent',
      className
    )}
    {...props}
  />
);

export default ResultHeaderButton;
