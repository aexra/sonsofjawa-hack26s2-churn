import { Dialog as DialogPrimitive } from 'radix-ui';

import { cn } from '@/shared/lib/cn';

import type { ReactNode } from 'react';

export const dialogOverlayClass = 'fixed inset-0 z-50 bg-scrim';

export const dialogContentClass =
  'fixed top-1/2 left-1/2 z-50 box-border flex w-110 max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-md border border-line bg-surface p-6 shadow-pop';

export const dialogTitleClass = 'm-0 font-display text-[17px] leading-6 font-semibold';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function Dialog({ open, onOpenChange, title, children, actions }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={dialogOverlayClass} />
        <DialogPrimitive.Content aria-describedby={undefined} className={dialogContentClass}>
          <DialogPrimitive.Title className={dialogTitleClass}>{title}</DialogPrimitive.Title>
          <div className={cn('text-ink-muted')}>{children}</div>
          {actions && <div className="flex justify-end gap-2">{actions}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
