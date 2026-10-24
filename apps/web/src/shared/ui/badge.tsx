import { cva } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const badge = cva('inline-flex items-center gap-1.5 rounded-xs text-label whitespace-nowrap', {
  variants: {
    tone: {
      accent: 'bg-accent-soft text-accent',
      low: 'bg-risk-low-soft text-risk-low',
      medium: 'bg-risk-medium-soft text-risk-medium',
      none: 'bg-risk-none-soft text-risk-none',
    },
    size: {
      md: 'h-6 px-2',
      sm: 'h-5 px-1.5 text-[11px]',
    },
  },
  defaultVariants: { tone: 'accent', size: 'md' },
});

interface BadgeProps {
  tone?: 'accent' | 'low' | 'medium' | 'none';
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  mono?: boolean;
  children: ReactNode;
}

export function Badge({ tone, size, icon: Icon, mono = false, children }: BadgeProps) {
  return (
    <span className={cn(badge({ tone, size }), mono && 'font-mono')}>
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}
