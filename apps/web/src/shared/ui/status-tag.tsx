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
    soft: {
      true: 'h-6 rounded-xs pr-2 pl-1.5 text-label',
      false: '',
    },
  },
  compoundVariants: [
    { tone: 'warning', soft: true, class: 'bg-risk-medium-soft' },
    { tone: 'negative', soft: true, class: 'bg-risk-high-soft' },
  ],
  defaultVariants: { tone: 'default', soft: false },
});

interface StatusTagProps {
  icon?: LucideIcon;
  tone?: 'default' | 'warning' | 'negative' | 'muted';
  soft?: boolean;
  children: ReactNode;
}

export function StatusTag({ icon: Icon, tone, soft, children }: StatusTagProps) {
  return (
    <span className={tag({ tone, soft })}>
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}
