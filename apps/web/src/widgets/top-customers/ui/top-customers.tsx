import { Link, useNavigate } from 'react-router';

import { ReasonText } from '@/entities/reason';
import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { formatMoney } from '@/shared/lib/format';
import { BlockError } from '@/shared/ui/block-error';
import { DataTable } from '@/shared/ui/data-table';
import { Skeleton } from '@/shared/ui/skeleton';

import { useTopCustomers } from '../model/use-top-customers';

export function TopCustomers() {
  const customers = useTopCustomers();
  const navigate = useNavigate();
  const text = ru.overview.top;

  return (
    <section aria-labelledby="overview-top" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="overview-top" className="m-0 font-display text-heading">
          {text.title}
        </h2>
        <Link
          to="/customers"
          className="text-[13px] font-medium text-accent underline hover:text-ink"
        >
          {text.all}
        </Link>
      </div>
      {customers.isError ? (
        <BlockError onRetry={() => void customers.refetch()} />
      ) : customers.isPending ? (
        <Skeleton className="h-60" />
      ) : customers.data.items.length === 0 ? (
        <p className="m-0 rounded-md border border-line bg-surface p-4 text-ink-muted">
          {text.empty}
        </p>
      ) : (
        <DataTable
          caption={text.title}
          rows={customers.data.items}
          rowKey={(row) => String(row.id)}
          onRowClick={(row) => void navigate(`/customers/${row.id}`)}
          columns={[
            {
              key: 'id',
              label: text.columns.id,
              align: 'right',
              mono: true,
              render: (row) => <Link to={`/customers/${row.id}`}>{row.id}</Link>,
            },
            { key: 'email', label: text.columns.email, mono: true, render: (row) => row.email },
            {
              key: 'score',
              label: text.columns.score,
              render: (row) => (
                <RiskBadge level={row.riskLevel ?? 'none'} score={row.riskScore ?? null} />
              ),
            },
            {
              key: 'reason',
              label: text.columns.reason,
              render: (row) =>
                row.topReason ? <ReasonText reason={row.topReason} /> : ru.common.emptyValue,
            },
            {
              key: 'loss',
              label: text.columns.loss,
              align: 'right',
              mono: true,
              render: (row) => (
                <b>
                  {row.expectedLoss == null ? ru.common.emptyValue : formatMoney(row.expectedLoss)}
                </b>
              ),
            },
          ]}
        />
      )}
    </section>
  );
}
