import * as React from 'react';

import { cn } from '@/lib/utils';

// Inside a StatList, rows are its terms (dt / dd); elsewhere, spans.
const InList = React.createContext(false);

// Label / value rows as a description list.
function StatList({ className, ...props }: React.ComponentProps<'dl'>) {
  return (
    <InList.Provider value>
      <dl
        data-slot='stat-list'
        className={cn('flex flex-col gap-1.5', className)}
        {...props}
      />
    </InList.Provider>
  );
}

type StatRowProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  // Before the label (a stat's icon).
  icon?: React.ReactNode;
  size?: 'xs' | '2xs';
  // 'stacked': the label over its value.
  layout?: 'inline' | 'stacked';
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  'data-testid'?: string;
};

// A label and its value: the label quiet, the value bright, in figures
// that line up.
function StatRow({
  label,
  value,
  icon,
  size = 'xs',
  layout = 'inline',
  className,
  labelClassName,
  valueClassName,
  'data-testid': testId,
}: StatRowProps) {
  const inList = React.useContext(InList);
  const Term = inList ? 'dt' : 'span';
  const Value = inList ? 'dd' : 'span';
  return (
    <div
      data-slot='stat-row'
      data-testid={testId}
      className={cn(
        size === 'xs' ? 'text-xs' : 'text-2xs',
        layout === 'inline'
          ? 'flex items-baseline justify-between gap-3'
          : 'flex flex-col',
        className
      )}
    >
      <Term
        className={cn(
          'text-subtle',
          icon && 'flex items-center gap-1.5',
          labelClassName
        )}
      >
        {icon}
        {label}
      </Term>
      <Value
        className={cn(
          'font-medium text-foreground tabular-nums',
          layout === 'inline' && 'text-right',
          valueClassName
        )}
      >
        {value}
      </Value>
    </div>
  );
}

export { StatList, StatRow };
