import { useAnalyticsSummary, type RecalcRun } from '@/entities/analytics';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime } from '@/shared/lib/format';
import { BlockError } from '@/shared/ui/block-error';
import { Skeleton } from '@/shared/ui/skeleton';

const recalcLine = (run: RecalcRun | null | undefined): string => {
  const text = ru.overview.reasons;
  if (!run) return text.noRecalc;
  const parts = [`${text.lastRecalc} ${formatDateTime(run.finishedAt ?? run.startedAt)}`];
  if (run.status === 'running') parts.push(text.running);
  if (run.status === 'failed') parts.push(text.failed);
  parts.push(text.trigger[run.trigger], text.accounts(run.accountsProcessed));
  if (run.modelVersion != null) parts.push(text.modelVersion(run.modelVersion));
  return parts.join(' · ');
};

export function TopReasons() {
  const summary = useAnalyticsSummary();

  if (summary.isError) {
    return <BlockError onRetry={() => void summary.refetch()} />;
  }

  const text = ru.overview.reasons;
  const peak = Math.max(1, ...(summary.data?.topReasons.map((reason) => reason.customers) ?? []));
  return (
    <section
      aria-labelledby="overview-reasons"
      className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="overview-reasons" className="m-0 font-display text-heading">
        {text.title}
      </h2>
      {summary.data ? (
        <>
          {summary.data.topReasons.length === 0 ? (
            <p className="m-0 text-ink-muted">{text.empty}</p>
          ) : (
            <ol className="m-0 flex flex-1 list-none flex-col gap-3 p-0">
              {summary.data.topReasons.map((reason) => (
                <li key={reason.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-strong">{reason.title}</span>
                    <span className="font-mono text-data whitespace-nowrap text-ink-muted">
                      {text.customers(reason.customers)}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-2 overflow-hidden rounded-xs bg-surface-sunken"
                  >
                    <i
                      className="block h-full rounded-xs bg-accent"
                      style={{ width: `${(reason.customers / peak) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="m-0 mt-auto border-t border-line pt-3 text-caption text-ink-muted">
            {recalcLine(summary.data.lastRecalc)}
          </p>
        </>
      ) : (
        <>
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-4" />
        </>
      )}
    </section>
  );
}
