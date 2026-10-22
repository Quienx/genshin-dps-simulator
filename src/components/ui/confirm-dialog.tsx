'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  // More of the body, under the description.
  children?: React.ReactNode;
  confirmLabel: string;
  // null: no Cancel, the dialog only tells something (an alert).
  cancelLabel?: string | null;
  destructive?: boolean;
  onConfirm?: () => void;
  // Buttons between Cancel and the confirmation.
  actions?: React.ReactNode;
  'data-testid'?: string;
  confirmTestId?: string;
};

// Asks before doing something (or tells something that happened): the
// focus starts on Cancel, so Enter never confirms by accident.
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  actions,
  'data-testid': testId,
  confirmTestId,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          {cancelLabel !== null && (
            <DialogClose asChild>
              <Button variant='outline' size='xs'>
                {cancelLabel}
              </Button>
            </DialogClose>
          )}
          {actions}
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size='xs'
            data-testid={confirmTestId}
            onClick={() => {
              onConfirm?.();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
