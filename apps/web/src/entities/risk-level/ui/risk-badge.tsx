import { cva } from 'class-variance-authority';
import { CircleAlert, CircleMinus, Clock, ShieldCheck, TriangleAlert } from 'lucide-react';

import { ru } from '@/shared/i18n/ru';
import { formatScore } from '@/shared/lib/format';

export type RiskLevel = 'high' | 'medium' | 'low' | 'none' | 'pending';

const badge = cva('inline-flex items-center gap-1 rounded-xs text-label whitespace-nowrap', {
  variants: {
    level: {
      high: 'bg-risk-high-soft text-risk-high',
      medium: 'bg-risk-medium-soft text-risk-medium',
      low: 'bg-risk-low-soft text-risk-low',
      none: 'bg-risk-none-soft text-risk-none',
      pending: 'bg-risk-none-soft text-risk-none',
    },
    size: {
      md: 'h-6 pr-2 pl-1.5',
      lg: 'h-7 pr-3 pl-2 text-[13px]',
    },
  },
});

const icons = {
  high: TriangleAlert,
  medium: CircleAlert,
  low: ShieldCheck,
  none: CircleMinus,
  pending: Clock,
};

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number | null;
  size?: 'md' | 'lg';
}

export function RiskBadge({ level, score, size = 'md' }: RiskBadgeProps) {
  const Icon = icons[level];
  return (
    <span className="inline-flex items-center gap-2">
      {score !== undefined && (
        <span className="font-mono text-data-strong tabular-nums">
          {score === null ? ru.common.emptyValue : formatScore(score)}
        </span>
      )}
      <span className={badge({ level, size })}>
        <Icon
          aria-hidden="true"
          className={level === 'pending' ? 'size-3.5 animate-pulse' : 'size-3.5'}
        />
        {ru.risk[level]}
      </span>
    </span>
  );
}
