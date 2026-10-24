import { CircleAlert, CircleMinus, Inbox, SearchX, ShieldAlert } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import type { ReactNode } from 'react';

const icons = {
  empty: Inbox,
  filter: SearchX,
  'no-score': CircleMinus,
  error: CircleAlert,
  forbidden: ShieldAlert,
};

interface EmptyStateProps {
  kind: keyof typeof icons;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ kind, title, text, action }: EmptyStateProps) {
  const Icon = icons[kind];
  const isError = kind === 'error';
  return (
    <div
      role={isError ? 'alert' : undefined}
      className="flex flex-col items-center gap-2 px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-2 grid size-10 place-items-center rounded-md',
          isError ? 'bg-risk-high-soft text-negative' : 'bg-surface-sunken text-ink-muted',
        )}
      >
        <Icon className="size-5" />
      </span>
      <h2 className="m-0 font-display text-heading">{title}</h2>
      {text && <p className="m-0 max-w-[48ch] text-ink-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
