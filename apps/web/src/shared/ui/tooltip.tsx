import { Tooltip as TooltipPrimitive } from 'radix-ui';

import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  open?: boolean;
}

export function Tooltip({ content, children, open }: TooltipProps) {
  return (
    <TooltipPrimitive.Root open={open}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={8}
          className="z-50 max-w-65 rounded-sm bg-ink px-2 py-1.5 text-caption text-canvas shadow-pop"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
