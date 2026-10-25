import { ru } from '@/shared/i18n/ru';

import { ForecastPattern } from './forecast-pattern';

export function ChartLegend({
  patternId,
  source = 'expert',
}: {
  patternId: string;
  source?: 'expert' | 'ml';
}) {
  const text = ru.overview.chart;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-caption text-ink-muted">
      <li className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 14 10" className="h-2.5 w-3.5">
          <rect width={14} height={10} rx={2} fill="var(--ca-chart-fact)" />
        </svg>
        {text.facts}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 14 10" className="h-2.5 w-3.5">
          <rect width={14} height={10} rx={2} fill="var(--ca-chart-fact-estimated)" />
        </svg>
        {text.estimated}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 14 10" className="h-2.5 w-3.5">
          <defs>
            <ForecastPattern id={`${patternId}-legend`} />
          </defs>
          <rect
            width={14}
            height={10}
            rx={2}
            fill={source === 'ml' ? 'var(--ca-risk-low)' : `url(#${patternId}-legend)`}
          />
          <rect
            x={0.5}
            y={0.5}
            width={13}
            height={9}
            rx={2}
            fill="none"
            stroke={source === 'ml' ? 'var(--ca-risk-low)' : 'var(--ca-chart-forecast)'}
          />
        </svg>
        {source === 'ml' ? 'прогноз ML' : 'экспертная оценка непродлений'}
      </li>
      <li className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" viewBox="0 0 14 10" className="h-2.5 w-3.5">
          <line x1={0} x2={14} y1={5} y2={5} stroke="var(--ca-risk-medium-fill)" strokeWidth={2} />
        </svg>
        {text.atRisk}
      </li>
    </ul>
  );
}
