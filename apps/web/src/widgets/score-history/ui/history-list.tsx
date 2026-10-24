import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';

import type { ScoreHistoryPoint } from '@/entities/customer';

const text = ru.customer.history;

function PointBadge({ point }: { point: ScoreHistoryPoint }) {
  if (point.status === 'removed') {
    return <span className="text-ink-muted">{text.removed}</span>;
  }
  return <RiskBadge level={point.riskLevel ?? 'none'} score={point.riskScore ?? undefined} />;
}

export function HistoryList({ points }: { points: ScoreHistoryPoint[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {[...points].reverse().map((point) => (
        <li
          key={point.calculatedAt}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-2.5"
        >
          <span className="font-mono text-data">{formatDateTime(point.calculatedAt)}</span>
          <span>{text.modelVersion(point.modelVersion)}</span>
          <PointBadge point={point} />
        </li>
      ))}
    </ol>
  );
}
