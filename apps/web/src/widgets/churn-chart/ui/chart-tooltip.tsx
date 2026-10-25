import { ru } from '@/shared/i18n/ru';
import { formatInt, formatMoney, formatPlainDate } from '@/shared/lib/format';

import type { ChartRow } from '../model/chart-data';
import type { TooltipContentProps } from 'recharts';

const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function ChartTooltip({ active, payload }: TooltipContentProps) {
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  const text = ru.overview.chart;
  const lines: [string, string][] = [];
  if (row.deletions !== undefined) lines.push([text.facts, formatInt(row.deletions)]);
  if (row.deletionsEstimated !== undefined) {
    lines.push([text.estimated, formatInt(row.deletionsEstimated)]);
  }
  if (row.overdueNonRenewals !== undefined) {
    lines.push([text.overdue, decimal.format(row.overdueNonRenewals)]);
  }
  if (row.overdueLossAmount !== undefined) {
    lines.push([text.overdueLoss, formatMoney(row.overdueLossAmount)]);
  }
  if (row.expectedNonRenewals !== undefined) {
    lines.push([text.forecast, decimal.format(row.expectedNonRenewals)]);
  }
  if (row.expectedLossAmount !== undefined) {
    lines.push([text.loss, formatMoney(row.expectedLossAmount)]);
  }
  if (row.servicesAtRisk !== undefined) lines.push([text.atRisk, formatInt(row.servicesAtRisk)]);

  return (
    <div className="rounded-sm border border-line bg-surface p-3 text-caption shadow-pop">
      <p className="m-0 mb-1.5 font-mono text-data-strong text-ink">{formatPlainDate(row.date)}</p>
      <dl className="m-0 flex flex-col gap-1">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="m-0 font-mono text-data text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
