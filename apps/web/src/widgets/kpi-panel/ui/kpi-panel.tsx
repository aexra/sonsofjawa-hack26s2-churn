import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAnalyticsSummary, type AnalyticsSummary } from '@/entities/analytics';
import { ru } from '@/shared/i18n/ru';
import { formatAmount, formatInt, formatScore } from '@/shared/lib/format';
import { BlockError } from '@/shared/ui/block-error';
import { Skeleton } from '@/shared/ui/skeleton';

import { FormulaDialog } from './formula-dialog';
import { KpiCard } from './kpi-card';

const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4';

function KpiCards({ summary }: { summary: AnalyticsSummary }) {
  const navigate = useNavigate();
  const text = ru.overview.kpi;
  const { accounts, money, horizonDays } = summary;
  const hasScores = accounts.scored > 0;
  const dash = ru.common.emptyValue;

  return (
    <div className={GRID}>
      <KpiCard
        primary
        label={text.loss(horizonDays)}
        value={hasScores ? formatAmount(money.expectedLoss) : dash}
        unit={hasScores ? '€' : undefined}
        hint={hasScores ? text.lossHint(accounts.scored) : undefined}
      />
      <KpiCard
        label={text.high}
        value={hasScores ? formatInt(accounts.high) : dash}
        unit={hasScores ? text.highOf(accounts.scored) : undefined}
        hint={
          hasScores
            ? text.highHint(Math.round((accounts.high / accounts.scored) * 100))
            : text.highHintEmpty
        }
        onClick={() => void navigate('/customers?level=high')}
      />
      <KpiCard
        label={text.revenue}
        value={hasScores ? formatAmount(money.revenueAtRisk) : dash}
        unit={hasScores ? '€' : undefined}
        hint={hasScores ? text.revenueHint(horizonDays) : undefined}
      />
      <KpiCard
        label={text.average}
        value={summary.avgRiskScore == null ? dash : formatScore(summary.avgRiskScore)}
        hint={accounts.noScore === 0 ? text.allScored : text.withoutScore(accounts.noScore)}
      />
    </div>
  );
}

export function KpiPanel() {
  const summary = useAnalyticsSummary();
  const [formulaOpen, setFormulaOpen] = useState(false);

  if (summary.isError) {
    return <BlockError onRetry={() => void summary.refetch()} />;
  }

  if (!summary.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5.5 w-60" />
        <div className={GRID}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-30" />
          ))}
        </div>
      </div>
    );
  }

  const { horizonDays } = summary.data;
  return (
    <section aria-labelledby="overview-kpi" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2 id="overview-kpi" className="m-0 font-display text-heading">
          {ru.overview.kpi.title(horizonDays)}
        </h2>
        <button
          type="button"
          onClick={() => setFormulaOpen(true)}
          className="cursor-pointer border-0 bg-transparent p-0 text-caption text-accent underline hover:text-ink"
        >
          {ru.overview.kpi.formulaLink}
        </button>
      </div>
      {summary.data.accounts.scored === 0 && (
        <p className="m-0 text-ink-muted">{ru.overview.kpi.noScores}</p>
      )}
      <KpiCards summary={summary.data} />
      <FormulaDialog open={formulaOpen} onOpenChange={setFormulaOpen} horizonDays={horizonDays} />
    </section>
  );
}
