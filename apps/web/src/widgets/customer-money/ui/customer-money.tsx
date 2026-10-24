import { ru } from '@/shared/i18n/ru';
import { formatMoney, formatPercent } from '@/shared/lib/format';

import type { CustomerScore } from '@/entities/customer';

interface CustomerMoneyProps {
  score: CustomerScore;
}

const text = ru.customer.money;

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? ru.common.emptyValue : formatMoney(value);

interface RowProps {
  operator: string;
  label: string;
  value: string;
  total?: boolean;
}

function Row({ operator, label, value, total = false }: RowProps) {
  const cell = total ? 'pt-3 pb-2' : 'border-b border-dashed border-line py-2';
  return (
    <>
      <dt
        className={`m-0 flex items-baseline gap-2 ${cell} ${total ? 'font-medium text-ink' : 'text-ink-muted'}`}
      >
        <span aria-hidden="true" className="w-[1.5ch] font-mono text-ink-faint">
          {operator}
        </span>
        {label}
      </dt>
      <dd
        className={`m-0 text-right ${cell} ${
          total
            ? 'font-display text-[22px] leading-7 font-semibold text-risk-high'
            : 'font-mono text-data tabular-nums'
        }`}
      >
        {value}
      </dd>
    </>
  );
}

export function CustomerMoney({ score }: CustomerMoneyProps) {
  const days = score.horizonDays;
  return (
    <section
      aria-labelledby="customer-money"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="customer-money" className="m-0 font-display text-heading">
        {days === undefined ? text.loss : text.title(days)}
      </h2>
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto]">
        <Row
          operator=""
          label={days === undefined ? ru.customers.fields.revenueHorizon : text.revenue(days)}
          value={money(score.revenueHorizon)}
        />
        <Row operator="−" label={text.secured} value={money(score.securedAmount)} />
        <Row operator="=" label={text.uncovered} value={money(score.uncoveredAmount)} />
        <Row
          operator="×"
          label={text.probability}
          value={
            score.probability === null || score.probability === undefined
              ? ru.common.emptyValue
              : formatPercent(score.probability)
          }
        />
        <Row operator="=" label={text.loss} value={money(score.expectedLoss)} total />
      </dl>
      {days !== undefined && (
        <p className="m-0 max-w-[60ch] text-caption text-ink-muted">{text.note(days)}</p>
      )}
    </section>
  );
}
