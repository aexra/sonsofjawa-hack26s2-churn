import { useAnalyticsSummary } from '@/entities/analytics';
import { ru } from '@/shared/i18n/ru';
import { BlockError } from '@/shared/ui/block-error';
import { Skeleton } from '@/shared/ui/skeleton';

import { DistributionBar } from './distribution-bar';
import { ScoreHistogram } from './score-histogram';

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
      className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-surface p-4"
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
          {accounts.noScore > 0 && (
            <p className="m-0 text-caption text-ink-muted">{text.noScore(accounts.noScore)}</p>
          )}
          {accounts.pending > 0 && (
            <p className="m-0 text-caption text-ink-muted">{text.pending(accounts.pending)}</p>
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
