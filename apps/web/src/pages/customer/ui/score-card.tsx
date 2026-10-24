import { type CustomerScore } from '@/entities/customer';
import { findSettingValue, useModelSettings } from '@/entities/model-settings';
import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime, formatScore } from '@/shared/lib/format';
import { EmptyState } from '@/shared/ui/empty-state';

const text = ru.customer.score;

const dateOrDash = (value: string | null | undefined) =>
  value === null || value === undefined ? ru.common.emptyValue : formatDateTime(value);

function Heading() {
  return (
    <h2 id="customer-score" className="m-0 font-display text-heading">
      {text.title}
    </h2>
  );
}

export function ScoreCard({ score }: { score: CustomerScore }) {
  const settings = useModelSettings().data;
  const levelHigh = findSettingValue(settings, 'level_high');
  const levelMedium = findSettingValue(settings, 'level_medium');
  const shell = 'flex flex-col gap-4 rounded-md border border-line bg-surface p-4';

  if (score.status === 'no_score') {
    const reason = score.noScoreReason ?? 'no_services';
    return (
      <section aria-labelledby="customer-score" className={shell}>
        <Heading />
        <EmptyState kind="no-score" title={text.noScore} text={text.noScoreText[reason]} />
      </section>
    );
  }

  if (score.status === 'pending') {
    return (
      <section aria-labelledby="customer-score" className={shell}>
        <Heading />
        <div className="flex flex-wrap items-center gap-3">
          <RiskBadge level="pending" size="lg" />
          <span className="text-ink-muted">{text.pending}</span>
        </div>
        <p className="m-0 text-caption text-ink-muted">{text.pendingText}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="customer-score" className={shell}>
      <Heading />
      <div className="flex flex-wrap items-center gap-4">
        <RiskBadge level={score.riskLevel ?? 'none'} score={score.riskScore ?? null} size="lg" />
        <div className="flex flex-col">
          <span className="text-caption text-ink-muted">{text.loyalty}</span>
          <span className="font-mono text-[20px] leading-7 font-semibold tabular-nums">
            {score.loyalty === null || score.loyalty === undefined
              ? ru.common.emptyValue
              : formatScore(score.loyalty)}
          </span>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-data">
        <dt className="text-ink-muted">{text.recalculated}</dt>
        <dd className="m-0 text-right font-mono whitespace-nowrap tabular-nums">
          {dateOrDash(score.calculatedAt)}
        </dd>
        <dt className="text-ink-muted">{text.modelVersion}</dt>
        <dd className="m-0 text-right font-mono tabular-nums">
          {score.modelVersion ?? ru.common.emptyValue}
        </dd>
        <dt className="text-ink-muted">{text.validUntil}</dt>
        <dd className="m-0 text-right font-mono whitespace-nowrap tabular-nums">
          {dateOrDash(score.validUntil)}
        </dd>
      </dl>
      {score.horizonDays !== undefined && levelHigh !== undefined && levelMedium !== undefined && (
        <p className="m-0 text-caption text-ink-muted">
          {text.scale(score.horizonDays, levelHigh, levelMedium)}
        </p>
      )}
    </section>
  );
}
