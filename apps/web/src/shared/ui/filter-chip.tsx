import { Toggle } from 'radix-ui';

import { cn } from '@/shared/lib/cn';

import type { ReactNode } from 'react';

const dots = {
  high: 'bg-risk-high',
  medium: 'bg-risk-medium-fill',
  low: 'bg-risk-low',
  none: 'bg-line-strong',
};

interface FilterChipProps {
  children: ReactNode;
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  count?: number;
  tone?: keyof typeof dots;
  segmented?: boolean;
}

export function FilterChip({
  children,
  count,
  tone,
  segmented = false,
  ...props
}: FilterChipProps) {
  return (
    <Toggle.Root
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 border px-3 text-[13px] leading-4 font-medium transition-colors duration-120 ease-out',
        segmented
          ? 'rounded-sm border-transparent bg-transparent text-ink-muted hover:text-ink data-[state=on]:border-line-strong data-[state=on]:bg-surface data-[state=on]:text-ink'
          : 'rounded-full border-line-strong bg-surface text-ink data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-on-accent',
      )}
      {...props}
    >
      {tone && <span aria-hidden="true" className={cn('size-2 rounded-full', dots[tone])} />}
      {children}
      {count !== undefined && <span className="font-mono text-caption opacity-80">{count}</span>}
    </Toggle.Root>
  );
}
