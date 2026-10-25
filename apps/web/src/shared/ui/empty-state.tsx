import { CircleAlert, CircleMinus, Inbox, SearchX, ShieldAlert } from 'lucide-react';

import { IconTile } from './icon-tile';

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
      <span className="mb-2">
        <IconTile icon={Icon} size={48} tone={isError ? 'danger' : 'default'} />
      </span>
      <h2 className="m-0 font-display text-heading">{title}</h2>
      {text && <p className="m-0 max-w-[48ch] text-ink-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
