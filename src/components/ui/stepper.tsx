import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

type StepperProps = {
  label: React.ReactNode;
  // Its name for the − and + buttons, when the label is not plain text.
  name?: string;
  value: React.ReactNode;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  className?: string;
  valueClassName?: string;
  // On the value; the buttons get `-less` and `-more` after it.
  'data-testid'?: string;
};

// A value with − and + beside it.
function Stepper({
  label,
  name,
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  className,
  valueClassName,
  'data-testid': testId,
}: StepperProps) {
  const named = name ?? (typeof label === 'string' ? label : 'Value');
  return (
    <span
      data-slot='stepper'
      className={cn('flex items-center gap-1', className)}
    >
      {label}
      <Button
        variant='secondary'
        size='icon-xs'
        aria-label={`${named}: less`}
        data-testid={testId && `${testId}-less`}
        disabled={!canDecrement}
        onClick={onDecrement}
        className='rounded'
      >
        <Minus />
      </Button>
      <span
        data-testid={testId}
        className={cn(
          'w-8 text-center font-mono text-foreground tabular-nums',
          valueClassName
        )}
      >
        {value}
      </span>
      <Button
        variant='secondary'
        size='icon-xs'
        aria-label={`${named}: more`}
        data-testid={testId && `${testId}-more`}
        disabled={!canIncrement}
        onClick={onIncrement}
        className='rounded'
      >
        <Plus />
      </Button>
    </span>
  );
}

export { Stepper };
