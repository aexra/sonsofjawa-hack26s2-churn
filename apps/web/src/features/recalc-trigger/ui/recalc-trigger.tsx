import { useQueryClient } from '@tanstack/react-query';

import { useRecalcStatus, type RecalcStatus } from '@/entities/recalc';
import { useLiveEvent } from '@/shared/api/live-events';
import { queryKeys } from '@/shared/api/query-keys';
import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { plural } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { useRequestRecalc } from '../model/use-request-recalc';

type Tone = 'idle' | 'running' | 'error' | 'queued';

const timeOf = (iso: string): string => formatDateTime(iso).slice(11);

const summarize = (status: RecalcStatus): { tone: Tone; text: string } => {
  if (status.running) return { tone: 'running', text: ru.recalc.running };
  if (status.lastRun?.status === 'failed') return { tone: 'error', text: ru.recalc.failed };
  if (status.pendingAccounts > 0) {
    return {
      tone: 'queued',
      text: ru.ingest.recalc.queued(
        status.pendingAccounts,
        plural(status.pendingAccounts, ru.ingest.recalc.customerForms),
      ),
    };
  }
  const finished = status.lastRun?.finishedAt;
  return {
    tone: 'idle',
    text: finished ? ru.recalc.updated(timeOf(finished)) : ru.ingest.recalc.never,
  };
};

const DOT: Record<Tone, string> = {
  idle: 'bg-positive',
  running: 'animate-pulse bg-accent',
  error: 'bg-negative',
  queued: 'bg-warning',
};

export function RecalcTrigger() {
  const queryClient = useQueryClient();
  const status = useRecalcStatus();
  const request = useRequestRecalc();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.recalcStatus });
  useLiveEvent('recalc.started', refresh);
  useLiveEvent('recalc.failed', refresh);

  const lastRun = status.data?.lastRun;
  const summary = status.data ? summarize(status.data) : null;

  return (
    <section
      aria-labelledby="recalc-heading"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="recalc-heading" className="m-0 font-display text-heading">
        {ru.ingest.recalc.title}
      </h2>
      {status.isPending && <Skeleton className="h-28" />}
      {status.isError && (
        <p role="alert" className="m-0 text-negative">
          {ru.common.loadFailed}
        </p>
      )}
      {summary && status.data && (
        <>
          <span
            role="status"
            aria-live="polite"
            className="inline-flex h-7 items-center gap-2 self-stretch rounded-full border border-line bg-surface px-3 text-caption whitespace-nowrap text-ink-muted"
          >
            <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[summary.tone])} />
            {summary.text}
          </span>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-data">
            <dt className="text-ink-muted">{ru.ingest.recalc.lastRun}</dt>
            <dd className="m-0 font-mono">
              {lastRun
                ? formatDateTime(lastRun.finishedAt ?? lastRun.startedAt)
                : ru.common.emptyValue}
            </dd>
            <dt className="text-ink-muted">{ru.ingest.recalc.reason}</dt>
            <dd className="m-0">
              {lastRun ? ru.ingest.recalc.triggers[lastRun.trigger] : ru.common.emptyValue}
            </dd>
            <dt className="text-ink-muted">{ru.ingest.recalc.processed}</dt>
            <dd className="m-0 font-mono">{lastRun?.accountsProcessed ?? ru.common.emptyValue}</dd>
            <dt className="text-ink-muted">{ru.ingest.recalc.queue}</dt>
            <dd className="m-0 font-mono">{status.data.pendingAccounts}</dd>
          </dl>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={request.isPending} onClick={() => request.mutate('pending')}>
          {ru.ingest.recalc.now}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={request.isPending}
          onClick={() => request.mutate('all')}
        >
          {ru.ingest.recalc.all}
        </Button>
      </div>
      <p className="m-0 text-caption text-ink-muted">{ru.ingest.recalc.hint}</p>
    </section>
  );
}
