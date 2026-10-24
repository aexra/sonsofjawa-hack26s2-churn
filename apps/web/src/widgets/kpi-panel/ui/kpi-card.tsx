import { cn } from '@/shared/lib/cn';

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  primary?: boolean;
  onClick?: () => void;
}

export function KpiCard({ label, value, unit, hint, primary = false, onClick }: KpiCardProps) {
  const className = cn(
    'box-border flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface p-4 text-left font-[inherit] text-ink',
    onClick && 'cursor-pointer hover:border-line-strong',
  );
  const content = (
    <>
      <span className="text-label text-ink-muted">{label}</span>
      <span
        className={`font-display text-kpi whitespace-nowrap tabular-nums ${primary ? 'text-risk-high' : 'text-ink'}`}
      >
        {value}
        {unit && (
          <span className="ml-1 font-display text-[16px] leading-5 font-medium text-ink-muted">
            {unit}
          </span>
        )}
      </span>
      {hint && <span className="text-caption text-ink-muted">{hint}</span>}
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
