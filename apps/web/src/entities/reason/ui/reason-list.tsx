import { ru } from '@/shared/i18n/ru';
import { formatScore } from '@/shared/lib/format';
import { Tooltip } from '@/shared/ui/tooltip';

import type { Reason } from './reason-text';

interface ReasonListProps {
  reasons: Reason[];
}

export function ReasonList({ reasons }: ReasonListProps) {
  const top = Math.max(...reasons.map((reason) => reason.contribution), 0) || 1;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {reasons.map((reason) => (
        <li
          key={reason.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-t border-line py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(140px,220px)_64px]"
        >
          <div className="min-w-0">
            <div className="text-label text-ink-muted">{reason.title}</div>
            <div>{reason.text}</div>
          </div>
          <Tooltip
            content={
              <span className="flex flex-col gap-1">
                <span className="font-medium">{reason.title}</span>
                <span className="font-mono tabular-nums">
                  {ru.reason.value} {formatScore(reason.value)} · {ru.reason.weight}{' '}
                  {formatScore(reason.weight)}
                </span>
              </span>
            }
          >
            <div
              role="img"
              aria-label={ru.customer.reasons.bar(formatScore(reason.contribution))}
              className="order-3 col-span-2 h-2 overflow-hidden rounded-xs bg-surface-sunken md:order-none md:col-span-1"
            >
              <i
                className="block h-full rounded-xs bg-risk-high"
                style={{ width: `${String(Math.max(2, (reason.contribution / top) * 100))}%` }}
              />
            </div>
          </Tooltip>
          <div className="order-2 text-right font-mono text-data-strong font-semibold tabular-nums md:order-none">
            +{formatScore(reason.contribution)}
          </div>
        </li>
      ))}
    </ol>
  );
}
