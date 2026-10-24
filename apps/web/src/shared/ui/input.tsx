import { cn } from '@/shared/lib/cn';

import type { ComponentProps } from 'react';

type InputProps = ComponentProps<'input'> & { mono?: boolean; invalid?: boolean };

export function Input({ mono = false, invalid = false, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'box-border h-control-md min-w-0 rounded-sm border border-line-strong bg-surface px-3 text-body text-ink transition-colors duration-120 ease-out placeholder:text-ink-faint disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint aria-invalid:border-negative',
        mono && 'font-mono text-data tabular-nums',
        className,
      )}
      {...props}
    />
  );
}
