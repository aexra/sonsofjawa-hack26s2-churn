import { cva } from 'class-variance-authority';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const tag = cva('inline-flex items-center gap-1.5 whitespace-nowrap', {
  variants: {
    tone: {
      default: 'text-ink',
      warning: 'text-warning',
      negative: 'text-negative',
      muted: 'text-ink-muted',
    },
  },
  defaultVariants: { tone: 'default' },
});

interface StatusTagProps {
  icon?: LucideIcon;
  tone?: 'default' | 'warning' | 'negative' | 'muted';
  children: ReactNode;
}

export function StatusTag({ icon: Icon, tone, children }: StatusTagProps) {
  return (
    <span className={tag({ tone })}>
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}
