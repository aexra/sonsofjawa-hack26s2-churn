import { useId, useMemo, useSyncExternalStore } from 'react';
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

import { ru } from '@/shared/i18n/ru';
import { formatDayMonth } from '@/shared/lib/format';

import { toChartRows, todayDate } from '../model/chart-data';

import { ChartLegend } from './chart-legend';
import { ChartTooltip } from './chart-tooltip';
import { ForecastPattern } from './forecast-pattern';
import { NowBadge } from './now-badge';

import type { ChurnChart as Chart } from '@/entities/analytics';

const COUNT_AXIS = 'count';
const RISK_AXIS = 'risk';
const AXIS_TICK = { fill: 'var(--ca-ink-faint)', fontSize: 11 };

const subscribeMotion = (callback: () => void) => {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener('change', callback);
  return () => media?.removeEventListener('change', callback);
};
const reducedMotionSnapshot = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

export function ForecastPlot({
  chart,
  source,
  maximum,
  title,
}: {
  chart: Chart;
  source: 'expert' | 'ml';
  maximum: number;
  title: string;
}) {
  const patternId = `forecast-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rows = useMemo(() => toChartRows(chart.points), [chart]);
  const reducedMotion = useSyncExternalStore(subscribeMotion, reducedMotionSnapshot, () => true);
  const text = ru.overview.chart;
  const now = todayDate(rows);
  return (
    <figure data-source={source} aria-label={title} className="m-0 flex flex-col gap-3">
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
              domain={[0, maximum]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <YAxis yAxisId={RISK_AXIS} orientation="right" hide domain={[0, 'auto']} />
            <Tooltip
              content={(props) => <ChartTooltip {...props} forecastLabel={title} />}
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
              isAnimationActive={!reducedMotion}
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Bar
              yAxisId={COUNT_AXIS}
              dataKey="deletionsEstimated"
              name={text.estimated}
              stackId="day"
              radius={[2, 2, 0, 0]}
              className="series-estimated"
              fill="var(--ca-chart-fact-estimated)"
              isAnimationActive={!reducedMotion}
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Bar
              yAxisId={COUNT_AXIS}
              dataKey="expectedNonRenewals"
              name={text.forecast}
              stackId="day"
              radius={[2, 2, 0, 0]}
              className="series-forecast"
              fill={source === 'ml' ? 'var(--ca-risk-low)' : `url(#${patternId})`}
              stroke={source === 'ml' ? 'var(--ca-risk-low)' : 'var(--ca-chart-forecast)'}
              isAnimationActive={!reducedMotion}
              animationDuration={650}
              animationEasing="ease-out"
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
              isAnimationActive={!reducedMotion}
              animationDuration={650}
              animationEasing="ease-out"
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
      <ChartLegend patternId={patternId} source={source} />
    </figure>
  );
}
