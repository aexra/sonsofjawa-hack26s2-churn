import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';

import { Button } from './button';
import { dialogContentClass, dialogOverlayClass, dialogTitleClass } from './dialog';

import type { ReactNode } from 'react';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={dialogOverlayClass} />
        <AlertDialogPrimitive.Content className={dialogContentClass}>
          <AlertDialogPrimitive.Title className={`${dialogTitleClass} text-negative`}>
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-ink-muted">
            {children}
          </AlertDialogPrimitive.Description>
          <div className="flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button>{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
