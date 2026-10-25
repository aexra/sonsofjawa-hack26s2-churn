import { useState } from 'react';

import { useForecastComparison } from '@/entities/analytics';
import { findSettingValue, useModelSettings } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';
import { BlockError } from '@/shared/ui/block-error';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import { countFutureDays, countPastDays, toChartRows } from '../model/chart-data';

import { ForecastPlot } from './forecast-plot';
import './comparison.css';

const MODES = ['expert', 'ml', 'compare'] as const;
const LABELS = { expert: 'экспертная', ml: 'модель ML', compare: 'сравнение' };
type Mode = (typeof MODES)[number];

export function ChurnChart() {
  const [mode, setMode] = useState<Mode>('expert');
  const chart = useForecastComparison(mode !== 'expert');
  const settings = useModelSettings();
  const data = chart.data;
  const text = ru.overview.chart;
  const graceDays = findSettingValue(settings.data, 'grace_days');
  const rows = toChartRows(data?.expert.points ?? []);
  const maximum = Math.max(
    1,
    ...[...(data?.expert.points ?? []), ...(data?.ml?.points ?? [])].map(
      (point) =>
        (point.deletions ?? 0) + (point.deletionsEstimated ?? 0) + (point.expectedNonRenewals ?? 0),
    ),
  );
  const panels = mode === 'compare' ? (['expert', 'ml'] as const) : ([mode] as const);
  const select = (next: Mode) => {
    if (next === mode) return;
    if (next !== 'expert' && mode !== 'expert') void chart.refetch();
    setMode(next);
  };

  return (
    <section
      aria-labelledby="overview-chart"
      className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="overview-chart" className="m-0 font-display text-heading">
          {text.title}
        </h2>
        {data && (
          <span className="text-caption text-ink-muted">
            {text.range(countPastDays(rows), countFutureDays(rows))}
            {graceDays !== undefined && ` · ${text.grace(graceDays)}`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="forecast-switch" role="group" aria-label="источник прогноза">
          <span
            className="forecast-switch-indicator"
            aria-hidden="true"
            style={{ transform: `translateX(${String(MODES.indexOf(mode) * 100)}%)` }}
          />
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              className="forecast-switch-button"
              onClick={() => select(item)}
            >
              {LABELS[item]}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          loading={chart.isFetching}
          onClick={() => void chart.refetch()}
        >
          {chart.isFetching ? 'считаем прогноз…' : 'пересчитать'}
        </Button>
      </div>
      <p className="m-0 text-caption text-ink-muted">
        ближайшее продление каждой услуги · только будущие платежи · суммы по графику оплаты
        {mode === 'compare' && ' · общая шкала для двух моделей'}
      </p>
      {mode !== 'expert' && data?.provenance === 'synthetic' && (
        <p className="m-0 text-caption text-warning">
          демонстрационная ML-модель · обучена на синтетических исходах
        </p>
      )}
      {chart.isError && <BlockError onRetry={() => void chart.refetch()} />}
      {!data && !chart.isError && <Skeleton className="h-75" />}
      {data && (
        <div
          className={
            mode === 'compare' ? 'forecast-panels forecast-panels-pair' : 'forecast-panels'
          }
          aria-busy={chart.isFetching}
        >
          {panels.map((source) => {
            const series = source === 'ml' ? data.ml : data.expert;
            const title = source === 'ml' ? 'прогноз ML' : 'экспертная оценка';
            const total = series?.points.reduce(
              (sum, point) => sum + (point.expectedNonRenewals ?? 0),
              0,
            );
            const amount = series?.points.reduce(
              (sum, point) => sum + (point.expectedLossAmount ?? 0),
              0,
            );
            return (
              <div key={source} className="min-w-0" aria-label={title}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-caption">
                  <h3 className="m-0 text-body-strong">{title}</h3>
                  {total !== undefined && amount !== undefined && (
                    <span className="font-mono text-ink-muted">
                      {total.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} непродлений ·{' '}
                      {formatMoney(amount)}
                    </span>
                  )}
                </div>
                {series ? (
                  <ForecastPlot
                    key={`${source}-${mode}`}
                    chart={series}
                    source={source}
                    maximum={maximum}
                    title={title}
                  />
                ) : (
                  <div className="flex h-65 flex-col items-center justify-center gap-3 text-center text-caption text-ink-muted">
                    {chart.isFetching ? (
                      <span>рассчитываем прогноз ML…</span>
                    ) : (
                      <>
                        <p className="m-0">модель пока не готова или недоступна</p>
                        <p className="m-0 max-w-80">
                          экспертная оценка сохранена. повторим запрос автоматически через 10
                          секунд.
                        </p>
                        <Button size="sm" onClick={() => void chart.refetch()}>
                          повторить сейчас
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {mode !== 'expert' && data?.training && (
        <p className="m-0 text-caption text-ink-muted" aria-live="polite">
          {data.training.state === 'training'
            ? 'переобучение идёт в фоне; показан расчёт действующей модели'
            : `автопереобучение каждые ${String(Math.round(data.training.intervalSeconds / 60))} мин. при новых данных`}
          {data.modelId && ` · версия ${data.modelId.slice(0, 8)}`}
        </p>
      )}
    </section>
  );
}
