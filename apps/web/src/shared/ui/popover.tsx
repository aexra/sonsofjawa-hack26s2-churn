import { Popover as PopoverPrimitive } from 'radix-ui';

import { cn } from '@/shared/lib/cn';

import type { ComponentProps } from 'react';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={8}
        className={cn(
          'z-50 w-72 rounded-md border border-line bg-surface p-4 text-body text-ink shadow-pop',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
