import * as React from 'react';

import { cn } from '@/lib/utils';

import { fieldVariants } from '@/components/ui/input';

// No spinner arrows: the value is typed.
const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

type NumberFieldProps = Omit<React.ComponentProps<'input'>, 'type' | 'size'> & {
  // 'boxed': a field's box; 'inline': looks like plain text, a faint line
  // under it on hover and the accent's while typing.
  variant?: 'boxed' | 'inline';
  size?: 'default' | 'sm' | 'xs';
  // Why the value is wrong: shown under it, and the field turns red.
  error?: string | null;
  // Called when the typing is done: on leaving the field or on Enter.
  onCommit?: () => void;
  'data-error-testid'?: string;
};

// A number typed in place.
function NumberField({
  variant = 'boxed',
  size = 'default',
  error = null,
  onCommit,
  onBlur,
  onKeyDown,
  className,
  'data-error-testid': errorTestId,
  ...props
}: NumberFieldProps) {
  const input = (
    <input
      type='number'
      data-slot='number-field'
      aria-invalid={error !== null || undefined}
      title={error ?? props.title}
      onBlur={(event) => {
        onBlur?.(event);
        onCommit?.();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      className={cn(
        NO_SPINNER,
        'tabular-nums',
        variant === 'boxed'
          ? cn(fieldVariants({ size }), 'text-center font-mono')
          : 'h-5 border-0 border-b border-transparent bg-transparent p-0 text-right text-xs font-medium text-foreground transition-colors hover:border-input focus:border-brand-500 focus:ring-0 focus:outline-none disabled:opacity-50 aria-invalid:border-rose-500 aria-invalid:text-rose-300',
        className
      )}
      {...props}
    />
  );
  if (error === null) {
    return input;
  }
  return (
    <span className='flex flex-col items-end'>
      {input}
      <span
        role='alert'
        data-testid={errorTestId}
        className='mt-0.5 text-2xs leading-none whitespace-nowrap text-rose-300'
      >
        {error}
      </span>
    </span>
  );
}

export { NumberField };
