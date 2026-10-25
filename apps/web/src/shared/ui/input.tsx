import { Calendar, Search } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import type { ComponentProps } from 'react';

type InputProps = ComponentProps<'input'> & {
  mono?: boolean;
  invalid?: boolean;
  adornment?: 'search' | 'calendar';
};

const adornments = { search: Search, calendar: Calendar };

export function Input({
  mono = false,
  invalid = false,
  adornment,
  className,
  ...props
}: InputProps) {
  const field = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'box-border h-control-md min-w-0 rounded-sm border border-line-strong bg-canvas px-3 text-body text-ink transition-colors duration-120 ease-out placeholder:text-ink-faint disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint aria-invalid:border-negative',
        mono && 'font-mono text-data tabular-nums',
        adornment === 'search' && 'pl-9',
        adornment === 'calendar' && 'pr-9',
        adornment && 'w-full',
        !adornment && className,
      )}
      {...props}
    />
  );
  if (!adornment) return field;
  const Icon = adornments[adornment];
  return (
    <span className={cn('relative inline-flex min-w-0', className)}>
      {field}
      <Icon
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-ink-faint',
          adornment === 'search' ? 'left-3' : 'right-3',
        )}
      />
    </span>
  );
}
