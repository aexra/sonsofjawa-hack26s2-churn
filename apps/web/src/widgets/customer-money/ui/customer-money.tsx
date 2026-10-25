import { ru } from '@/shared/i18n/ru';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import { KeyValueList, Operator } from '@/shared/ui/key-value-list';

import type { CustomerScore } from '@/entities/customer';

interface CustomerMoneyProps {
  score: CustomerScore;
}

const text = ru.customer.money;

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? ru.common.emptyValue : formatMoney(value);

export function CustomerMoney({ score }: CustomerMoneyProps) {
  const days = score.horizonDays;
  return (
    <section
      aria-labelledby="customer-money"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="customer-money" className="m-0 font-display text-heading">
        {days === undefined ? text.loss : text.title(days)}
      </h2>
      <KeyValueList
        rows={[
          {
            operator: '',
            label: days === undefined ? ru.customers.fields.revenueHorizon : text.revenue(days),
            value: money(score.revenueHorizon),
          },
          { operator: '−', label: text.secured, value: money(score.securedAmount) },
          { operator: '=', label: text.uncovered, value: money(score.uncoveredAmount) },
          {
            operator: '×',
            label: text.probability,
            value:
              score.probability === null || score.probability === undefined
                ? ru.common.emptyValue
                : formatPercent(score.probability),
          },
        ]}
      />
      <dl className="m-0 flex items-center justify-between gap-3 rounded-sm bg-risk-high-soft px-3.5 py-3">
        <dt className="m-0 font-semibold">
          <Operator>=</Operator>
          {text.loss}
        </dt>
        <dd className="m-0 font-display text-[30px] leading-9 font-extrabold whitespace-nowrap text-risk-high">
          {money(score.expectedLoss)}
        </dd>
      </dl>
      {days !== undefined && (
        <p className="m-0 max-w-[60ch] text-caption text-ink-muted">{text.note(days)}</p>
      )}
    </section>
  );
}
