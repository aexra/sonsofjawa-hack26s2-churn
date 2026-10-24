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
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`${ru.overview.distribution.barLabel}: ${summary}`}
        className="flex h-4 gap-0.5 overflow-hidden rounded-xs"
      >
        {SEGMENTS.filter((segment) => counts[segment.key] > 0).map((segment) => (
          <i
            key={segment.key}
            className={`block h-full min-w-0.5 ${segment.color}`}
            style={{ flexGrow: counts[segment.key] / total }}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-caption text-ink-muted">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-xs ${segment.color}`} />
            {ru.risk[segment.key]}
            <b className="font-mono text-data-strong text-ink">{formatInt(counts[segment.key])}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
