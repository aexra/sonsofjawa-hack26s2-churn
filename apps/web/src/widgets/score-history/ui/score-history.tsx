import { useMemo, useState } from 'react';

import { useCustomerHistory } from '@/entities/customer';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tabs';

import { MIN_CHART_POINTS, toRows, withinPeriod, type Period } from '../model/history-data';

import { HistoryChart } from './history-chart';
import { HistoryList } from './history-list';

const text = ru.customer.history;

const PERIODS: { id: Period; label: string }[] = [
  { id: '7', label: text.periods['7'] },
  { id: '30', label: text.periods['30'] },
  { id: 'all', label: text.periods.all },
];

const isPeriod = (value: string): value is Period => PERIODS.some((period) => period.id === value);

function Legend() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-caption text-ink-muted">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-5 bg-chart-forecast" />
        {text.score}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0 w-5 border-t-2 border-dashed border-chart-fact" />
        {text.loss}
      </li>
    </ul>
  );
}

export function ScoreHistory({ customerId }: { customerId: number }) {
  const history = useCustomerHistory(customerId);
  const [period, setPeriod] = useState<Period>('30');
  const points = history.data;
  const visible = useMemo(() => (points ? withinPeriod(points, period) : []), [points, period]);
  const rows = useMemo(() => toRows(visible), [visible]);

  let body;
  if (history.isPending) {
    body = <Skeleton className="h-40" />;
  } else if (history.isError) {
    body = (
      <EmptyState
        kind="error"
        title={ru.common.loadFailed}
        text={errorMessage(history.error)}
        action={<Button onClick={() => void history.refetch()}>{ru.common.retry}</Button>}
      />
    );
  } else if (history.data.length < MIN_CHART_POINTS) {
    body = <HistoryList points={history.data} />;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <Tabs
          items={PERIODS}
          value={period}
          label={text.period}
          onValueChange={(value) => {
            if (isPeriod(value)) setPeriod(value);
          }}
        />
        <figure aria-label={text.chartLabel} className="m-0 flex flex-col gap-2">
          {rows.length > 0 ? (
            <HistoryChart rows={rows} />
          ) : (
            <p className="m-0 py-8 text-center text-ink-muted">{text.emptyPeriod}</p>
          )}
          <figcaption className="flex flex-wrap items-center justify-between gap-2">
            <Legend />
            <span className="text-caption text-ink-muted">{text.points(rows.length)}</span>
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="score-history"
      className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="score-history" className="m-0 font-display text-heading">
        {text.title}
      </h2>
      {body}
    </section>
  );
}
