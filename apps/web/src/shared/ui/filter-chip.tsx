import { Toggle } from 'radix-ui';

import type { ReactNode } from 'react';

interface FilterChipProps {
  children: ReactNode;
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  count?: number;
}

export function FilterChip({ children, count, ...props }: FilterChipProps) {
  return (
    <Toggle.Root
      className="inline-flex h-control-sm cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] leading-4 font-medium text-ink data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:text-accent"
      {...props}
    >
      {children}
      {count !== undefined && <span className="font-mono text-caption opacity-80">{count}</span>}
    </Toggle.Root>
  );
}
