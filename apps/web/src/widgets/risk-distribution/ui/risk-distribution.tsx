import { Info, RefreshCw } from 'lucide-react';

import { useAnalyticsSummary } from '@/entities/analytics';
import { ru } from '@/shared/i18n/ru';
import { BlockError } from '@/shared/ui/block-error';
import { Skeleton } from '@/shared/ui/skeleton';

import { DistributionBar } from './distribution-bar';
import { ScoreHistogram } from './score-histogram';

import type { LucideIcon } from 'lucide-react';

function Hint({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-sm bg-surface-sunken px-3 py-2.5 text-caption text-ink-muted">
      <Icon aria-hidden="true" className="mt-px size-4 flex-none" />
      <span>{children}</span>
    </p>
  );
}

export function RiskDistribution() {
  const summary = useAnalyticsSummary();

  if (summary.isError) {
    return <BlockError onRetry={() => void summary.refetch()} />;
  }

  const text = ru.overview.distribution;
  const accounts = summary.data?.accounts;
  return (
    <section
      aria-labelledby="overview-distribution"
      className="flex min-w-0 flex-col gap-5 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="overview-distribution" className="m-0 font-display text-heading">
        {text.title}
      </h2>
      {summary.data && accounts ? (
        <>
          <DistributionBar
            high={accounts.high}
            medium={accounts.medium}
            low={accounts.low}
            none={accounts.noScore}
          />
          <ScoreHistogram buckets={summary.data.scoreHistogram} />
          {(accounts.noScore > 0 || accounts.pending > 0) && (
            <div className="flex flex-col gap-2">
              {accounts.noScore > 0 && <Hint icon={Info}>{text.noScore(accounts.noScore)}</Hint>}
              {accounts.pending > 0 && (
                <Hint icon={RefreshCw}>{text.pending(accounts.pending)}</Hint>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <Skeleton className="h-4" />
          <Skeleton className="h-20" />
        </>
      )}
    </section>
  );
}
