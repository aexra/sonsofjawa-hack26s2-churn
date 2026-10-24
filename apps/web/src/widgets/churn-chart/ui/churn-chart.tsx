import { useId, useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useChurnChart } from '@/entities/analytics';
import { findSettingValue, useModelSettings } from '@/entities/model-settings';
import { ru } from '@/shared/i18n/ru';
import { formatDayMonth } from '@/shared/lib/format';
import { BlockError } from '@/shared/ui/block-error';
import { Skeleton } from '@/shared/ui/skeleton';

import { countFutureDays, countPastDays, toChartRows, todayDate } from '../model/chart-data';

import { ChartLegend } from './chart-legend';
import { ChartTooltip } from './chart-tooltip';
import { ForecastPattern } from './forecast-pattern';
import { NowBadge } from './now-badge';

const COUNT_AXIS = 'count';
const RISK_AXIS = 'risk';
const AXIS_TICK = { fill: 'var(--ca-ink-faint)', fontSize: 11 };

export function ChurnChart() {
  const chart = useChurnChart();
  const settings = useModelSettings();
  const patternId = `forecast-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rows = useMemo(() => toChartRows(chart.data?.points ?? []), [chart.data]);

  if (chart.isError) {
    return <BlockError onRetry={() => void chart.refetch()} />;
  }

  const text = ru.overview.chart;
  const graceDays = findSettingValue(settings.data, 'grace_days');
  const now = todayDate(rows);

  return (
    <section
      aria-labelledby="overview-chart"
      className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="overview-chart" className="m-0 font-display text-heading">
          {text.title}
        </h2>
        {chart.data && (
          <span className="text-caption text-ink-muted">
            {text.range(countPastDays(rows), countFutureDays(rows))}
            {graceDays !== undefined && ` · ${text.grace(graceDays)}`}
          </span>
        )}
      </div>
      {chart.data ? (
        <figure aria-label={text.label} className="m-0 flex flex-col gap-3">
          <div className="h-65 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 1100, height: 260 }}
            >
              <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <ForecastPattern id={patternId} />
                </defs>
                <CartesianGrid vertical={false} stroke="var(--ca-chart-grid)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayMonth}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--ca-chart-grid)' }}
                  minTickGap={36}
                />
                <YAxis
                  yAxisId={COUNT_AXIS}
                  allowDecimals={false}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <YAxis yAxisId={RISK_AXIS} orientation="right" hide domain={[0, 'auto']} />
                <Tooltip
                  content={(props) => <ChartTooltip {...props} />}
                  cursor={{ fill: 'var(--ca-surface-sunken)', opacity: 0.6 }}
                />
                <Bar
                  yAxisId={COUNT_AXIS}
                  dataKey="deletions"
                  name={text.facts}
                  stackId="day"
                  radius={[2, 2, 0, 0]}
                  className="series-facts"
                  fill="var(--ca-chart-fact)"
                  isAnimationActive={false}
                />
                <Bar
                  yAxisId={COUNT_AXIS}
                  dataKey="deletionsEstimated"
                  name={text.estimated}
                  stackId="day"
                  radius={[2, 2, 0, 0]}
                  className="series-estimated"
                  fill="var(--ca-chart-fact-estimated)"
                  isAnimationActive={false}
                />
                <Bar
                  yAxisId={COUNT_AXIS}
                  dataKey="expectedNonRenewals"
                  name={text.forecast}
                  stackId="day"
                  radius={[2, 2, 0, 0]}
                  className="series-forecast"
                  fill={`url(#${patternId})`}
                  stroke="var(--ca-chart-forecast)"
                  isAnimationActive={false}
                />
                <Line
                  yAxisId={RISK_AXIS}
                  dataKey="servicesAtRisk"
                  name={text.atRisk}
                  className="series-at-risk"
                  type="monotone"
                  stroke="var(--ca-risk-medium-fill)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
                {now && (
                  <ReferenceLine
                    yAxisId={COUNT_AXIS}
                    x={now}
                    stroke="var(--ca-ink)"
                    strokeDasharray="3 3"
                    label={<NowBadge value={text.now} />}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend patternId={patternId} />
        </figure>
      ) : (
        <Skeleton className="h-75" />
      )}
    </section>
  );
}
