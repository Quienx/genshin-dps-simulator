'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// The chevron of something that opens and closes: down when open, right
// when closed.
function DisclosureChevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <ChevronDown
      aria-hidden
      className={cn(
        'size-3 shrink-0 text-subtle transition-transform',
        !open && '-rotate-90',
        className
      )}
    />
  );
}

type DisclosureButtonProps = Omit<React.ComponentProps<'button'>, 'onClick'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chevronClassName?: string;
};

// A section's title that opens and closes it, for a section whose body is
// laid out apart from its title: the chevron, then the title.
function DisclosureButton({
  open,
  onOpenChange,
  chevronClassName,
  className,
  children,
  ...props
}: DisclosureButtonProps) {
  return (
    <button
      type='button'
      data-slot='disclosure-button'
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
      className={cn(
        'flex w-full items-center gap-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default',
        className
      )}
      {...props}
    >
      <DisclosureChevron open={open} className={chevronClassName} />
      {children}
    </button>
  );
}

type CollapsibleSectionProps = {
  title: React.ReactNode;
  // Beside the title, at the end of its line (a count, a total).
  meta?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  chevronClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

// A titled section that opens and closes, its body right under its title.
function CollapsibleSection({
  title,
  meta,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled,
  className,
  triggerClassName,
  chevronClassName,
  contentClassName,
  children,
}: CollapsibleSectionProps) {
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const change = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Collapsible
      open={open}
      onOpenChange={change}
      disabled={disabled}
      className={className}
    >
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default',
          triggerClassName
        )}
      >
        <DisclosureChevron open={open} className={chevronClassName} />
        {title}
        {meta !== undefined && <span className='ml-auto'>{meta}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className={contentClassName}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export { CollapsibleSection, DisclosureButton, DisclosureChevron };
