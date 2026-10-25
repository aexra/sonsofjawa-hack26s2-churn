import { cn } from '@/shared/lib/cn';
import { IconTile } from '@/shared/ui/icon-tile';

import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'accent' | 'danger';
  primary?: boolean;
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone,
  primary = false,
  onClick,
}: KpiCardProps) {
  const className = cn(
    'relative box-border flex min-w-0 flex-col gap-2 overflow-hidden rounded-md border bg-surface p-5 text-left font-[inherit] text-ink',
    primary ? 'border-accent' : 'border-line',
    onClick && 'cursor-pointer hover:border-line-strong',
    onClick && primary && 'hover:border-accent',
  );
  const content = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-label text-ink-muted">{label}</span>
        <IconTile icon={icon} tone={tone} />
      </span>
      <span
        className={cn(
          'font-display text-kpi whitespace-nowrap tabular-nums',
          primary ? 'text-risk-high' : 'text-ink',
        )}
      >
        {value}
        {unit && (
          <span className="ml-1.5 font-display text-[18px] leading-6 font-medium text-ink-muted">
            {unit}
          </span>
        )}
      </span>
      {hint && <span className="text-caption text-ink-muted">{hint}</span>}
      {primary && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-accent" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
