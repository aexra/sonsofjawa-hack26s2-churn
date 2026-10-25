import {
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
import { formatDateTime, formatInt, formatScore } from '@/shared/lib/format';

import { versionChanges, type HistoryRow } from '../model/history-data';

import type { TooltipContentProps } from 'recharts';

const text = ru.customer.history;

const SCORE_AXIS = 'score';
const LOSS_AXIS = 'loss';
const AXIS_TICK = { fill: 'var(--ca-ink-muted)', fontSize: 12 };

const euro = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' });

function HistoryTooltip({ active, payload }: TooltipContentProps) {
  const row = payload[0]?.payload as HistoryRow | undefined;
  if (!active || !row) return null;
  const lines: [string, string][] = [
    [text.score, row.riskScore === null ? ru.common.emptyValue : formatScore(row.riskScore)],
    [text.loss, row.loss === null ? ru.common.emptyValue : euro.format(row.loss)],
    [ru.customer.score.modelVersion, formatInt(row.modelVersion)],
  ];
  return (
    <div className="rounded-sm border border-line bg-surface p-3 text-caption shadow-pop">
      <p className="m-0 mb-1.5 font-mono text-data-strong text-ink">
        {formatDateTime(new Date(row.time))}
      </p>
      <dl className="m-0 flex flex-col gap-1">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="m-0 font-mono text-data text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function HistoryChart({ rows }: { rows: HistoryRow[] }) {
  return (
    <div className="h-60 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--ca-chart-grid)" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value: number) => formatDateTime(new Date(value)).slice(0, 5)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--ca-chart-grid)' }}
            minTickGap={32}
          />
          <YAxis
            yAxisId={SCORE_AXIS}
            domain={[0, 100]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <YAxis
            yAxisId={LOSS_AXIS}
            orientation="right"
            domain={[0, 'auto']}
            tickFormatter={(value: number) => formatInt(value)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={(props) => <HistoryTooltip {...props} />} />
          {versionChanges(rows).map((row) => (
            <ReferenceLine
              key={row.time}
              yAxisId={SCORE_AXIS}
              x={row.time}
              stroke="var(--ca-ink-faint)"
              strokeDasharray="3 3"
              label={{
                value: text.version(row.modelVersion),
                position: 'insideTopLeft',
                fill: 'var(--ca-ink-muted)',
                fontSize: 12,
              }}
            />
          ))}
          <Line
            yAxisId={SCORE_AXIS}
            dataKey="riskScore"
            name={text.score}
            type="linear"
            stroke="var(--ca-chart-forecast)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId={LOSS_AXIS}
            dataKey="loss"
            name={text.loss}
            type="linear"
            stroke="var(--ca-chart-fact)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 3 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
