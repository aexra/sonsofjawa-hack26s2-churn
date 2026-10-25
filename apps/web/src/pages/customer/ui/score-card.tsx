import { type CustomerScore } from '@/entities/customer';
import { findSettingValue, useModelSettings } from '@/entities/model-settings';
import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, formatScore } from '@/shared/lib/format';
import { KeyValueList } from '@/shared/ui/key-value-list';

const text = ru.customer.score;

const dateOrDash = (value: string | null | undefined) =>
  value === null || value === undefined ? ru.common.emptyValue : formatDateTime(value);

const SCORE_TONES = {
  high: 'text-risk-high',
  medium: 'text-risk-medium',
  low: 'text-risk-low',
  none: 'text-ink',
  pending: 'text-ink',
} as const;

function Heading() {
  return (
    <h2 id="customer-score" className="m-0 font-display text-heading">
      {text.title}
    </h2>
  );
}

function LevelScale({ medium, high }: { medium: number; high: number }) {
  return (
    <div aria-hidden="true" className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
      <span className="bg-risk-low" style={{ flex: medium }} />
      <span className="bg-risk-medium-fill" style={{ flex: high - medium }} />
      <span className="bg-risk-high" style={{ flex: 100 - high }} />
    </div>
  );
}

export function ScoreCard({ score }: { score: CustomerScore }) {
  const settings = useModelSettings().data;
  const levelHigh = findSettingValue(settings, 'level_high');
  const levelMedium = findSettingValue(settings, 'level_medium');
  const shell = 'flex flex-col gap-3.5 rounded-md border border-line bg-surface p-5';

  if (score.status === 'no_score') {
    const reason = score.noScoreReason ?? 'no_services';
    return (
      <section aria-labelledby="customer-score" className={shell}>
        <Heading />
        <div className="flex flex-col items-start gap-3">
          <RiskBadge level="none" size="lg" />
          <p className="m-0 max-w-[56ch] text-ink-muted">{text.noScoreText[reason]}</p>
        </div>
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

  const level = score.riskLevel ?? 'none';
  const levelLabel = level === 'high' || level === 'medium' || level === 'low';
  return (
    <section aria-labelledby="customer-score" className={shell}>
      <Heading />
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex flex-col items-start gap-2">
          <span className={cn('font-display text-score tabular-nums', SCORE_TONES[level])}>
            {score.riskScore === null || score.riskScore === undefined
              ? ru.common.emptyValue
              : formatScore(score.riskScore)}
          </span>
          <RiskBadge
            level={level}
            size="lg"
            label={levelLabel ? text.levelLabel[level] : undefined}
          />
        </div>
        <div className="flex flex-col gap-0.5 border-l border-line pl-5">
          <span className="text-label text-ink-muted">{text.loyalty}</span>
          <span className="font-display text-[28px] leading-[34px] font-bold tabular-nums">
            {score.loyalty === null || score.loyalty === undefined
              ? ru.common.emptyValue
              : formatScore(score.loyalty)}
          </span>
        </div>
      </div>
      {levelHigh !== undefined && levelMedium !== undefined && (
        <LevelScale medium={levelMedium} high={levelHigh} />
      )}
      <KeyValueList
        rows={[
          { label: text.recalculated, value: dateOrDash(score.calculatedAt) },
          { label: text.modelVersion, value: score.modelVersion ?? ru.common.emptyValue },
          { label: text.validUntil, value: dateOrDash(score.validUntil) },
        ]}
      />
      {score.horizonDays !== undefined && levelHigh !== undefined && levelMedium !== undefined && (
        <p className="m-0 text-caption text-ink-muted">
          {text.scale(score.horizonDays, levelHigh, levelMedium)}
        </p>
      )}
    </section>
  );
}
