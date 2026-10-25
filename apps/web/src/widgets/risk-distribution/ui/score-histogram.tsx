import { ru } from '@/shared/i18n/ru';
import { formatInt } from '@/shared/lib/format';

import type { AnalyticsSummary } from '@/entities/analytics';

export function ScoreHistogram({ buckets }: { buckets: AnalyticsSummary['scoreHistogram'] }) {
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const text = ru.overview.distribution;
  return (
    <figure className="m-0 flex flex-col gap-2 border-t border-line pt-4">
      <figcaption className="text-label text-ink-muted">{text.histogramTitle}</figcaption>
      <ol aria-label={text.histogramLabel} className="m-0 grid list-none grid-cols-10 gap-1.5 p-0">
        {buckets.map((bucket) => (
          <li
            key={bucket.from}
            aria-label={text.bucket(bucket.from, bucket.to, bucket.count)}
            className="flex min-w-0 flex-col items-center gap-1.5"
          >
            <span className="font-mono text-data text-ink-muted">{formatInt(bucket.count)}</span>
            <span className="flex h-28 w-full items-end">
              <span
                className={`block min-h-1 w-full rounded-t-xs rounded-b-[2px] ${bucket.count > 0 ? 'bg-accent' : 'bg-surface-sunken'}`}
                style={{ height: `${(bucket.count / peak) * 100}%` }}
              />
            </span>
            <span className="font-mono text-data text-ink-faint">{bucket.from}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
