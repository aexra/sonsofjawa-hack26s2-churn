import { Check } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { cn } from '@/shared/lib/cn';

import type { ComponentProps } from 'react';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const itemClass =
  'flex h-control-md cursor-pointer items-center gap-2 rounded-xs px-3 text-body text-ink outline-none data-highlighted:bg-surface-sunken';

export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align="end"
        sideOffset={8}
        className={cn(
          'z-50 min-w-56 rounded-sm border border-line bg-surface p-1 shadow-pop',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-3 py-1 text-caption text-ink-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />;
}

export function DropdownMenuRadioItem({
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(itemClass, 'justify-between')} {...props}>
      {children}
      <DropdownMenuPrimitive.ItemIndicator>
        <Check aria-hidden="true" className="size-4 text-accent" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
}
