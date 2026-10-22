'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { SectionLabel } from '@/components/ui/section-label';

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot='dropdown-menu' {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot='dropdown-menu-trigger'
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot='dropdown-menu-content'
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-32 overflow-y-auto rounded-lg border border-border bg-card p-1 text-foreground shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

type DropdownMenuItemProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.Item
> & {
  icon?: React.ReactNode;
  // A second, quieter line under the item's name.
  description?: React.ReactNode;
};

// An option: its icon, its name and, optionally, what it does.
function DropdownMenuItem({
  className,
  icon,
  description,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-item'
      className={cn(
        'flex cursor-pointer gap-2.5 rounded-md px-2 py-1.5 text-xs outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-muted [&_svg]:size-3.5 [&_svg]:shrink-0',
        description ? 'items-start' : 'items-center',
        className
      )}
      {...props}
    >
      {icon && (
        <span className={cn('text-subtle', description && 'mt-0.5')}>
          {icon}
        </span>
      )}
      {description ? (
        <span className='flex flex-col'>
          <span className='font-medium text-foreground'>{children}</span>
          <span className='text-2xs text-subtle'>{description}</span>
        </span>
      ) : (
        children
      )}
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenuLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot='dropdown-menu-label'
      asChild
      {...props}
    >
      <SectionLabel className={cn('px-2 pt-1.5 pb-1', className)}>
        {children}
      </SectionLabel>
    </DropdownMenuPrimitive.Label>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot='dropdown-menu-separator'
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
