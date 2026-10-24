import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { formatInt } from '@/shared/lib/format';

interface DistributionBarProps {
  high: number;
  medium: number;
  low: number;
  none: number;
}

const SEGMENTS = [
  { key: 'high', color: 'bg-risk-high' },
  { key: 'medium', color: 'bg-risk-medium-fill' },
  { key: 'low', color: 'bg-risk-low' },
  { key: 'none', color: 'bg-chart-fact-estimated' },
] as const;

export function DistributionBar(counts: DistributionBarProps) {
  const total = SEGMENTS.reduce((sum, segment) => sum + counts[segment.key], 0);
  const summary = SEGMENTS.map(
    (segment) => `${ru.risk[segment.key]} ${formatInt(counts[segment.key])}`,
  ).join(', ');
  return (
    <div className="flex flex-col gap-4">
      <div
        role="img"
        aria-label={`${ru.overview.distribution.barLabel}: ${summary}`}
        className="flex h-3.5 gap-0.75 overflow-hidden rounded-full"
      >
        {SEGMENTS.filter((segment) => counts[segment.key] > 0).map((segment) => (
          <i
            key={segment.key}
            className={`block h-full min-w-0.5 ${segment.color}`}
            style={{ flexGrow: counts[segment.key] / total }}
          />
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-2 gap-y-3 p-0 sm:grid-cols-4">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex min-w-0 flex-col items-start gap-0.5">
            <RiskBadge level={segment.key} />
            <b className="font-display text-[24px] leading-8 font-extrabold text-ink tabular-nums">
              {formatInt(counts[segment.key])}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
