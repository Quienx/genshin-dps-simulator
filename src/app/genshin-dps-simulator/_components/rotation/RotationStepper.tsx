import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

type RotationStepperProps = {
  label: string;
  value: number;
  min: number;
  max?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  'data-testid'?: string;
};

const RotationStepper = ({
  label,
  value,
  min,
  max = Number.POSITIVE_INFINITY,
  format = String,
  onChange,
  'data-testid': testId,
}: RotationStepperProps) => (
  <div
    data-testid={testId}
    role='group'
    aria-label={label}
    className='flex items-center gap-1'
  >
    <span className='text-xs text-muted-foreground'>{label}</span>
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className='size-6'
      aria-label={`Decrease ${label}`}
      disabled={value <= min}
      onClick={() => onChange(Math.max(min, value - 1))}
    >
      <Minus />
    </Button>
    <span className='min-w-6 text-center text-sm font-medium tabular-nums'>
      {format(value)}
    </span>
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className='size-6'
      aria-label={`Increase ${label}`}
      disabled={value >= max}
      onClick={() => onChange(Math.min(max, value + 1))}
    >
      <Plus />
    </Button>
  </div>
);

export default RotationStepper;
