import { CircleAlert } from 'lucide-react';

import { ru } from '@/shared/i18n/ru';
import { formatDateTime, formatMoney } from '@/shared/lib/format';
import { DataTable } from '@/shared/ui/data-table';
import { StatusTag } from '@/shared/ui/status-tag';

import type { CustomerDetails } from '@/entities/customer';

interface TransactionsProps {
  customerId: number;
  transactions: CustomerDetails['transactions'];
  serviceNames: Map<number, string>;
}

const text = ru.customer.transactions;

export function Transactions({ customerId, transactions, serviceNames }: TransactionsProps) {
  const { items, total, notPerformed } = transactions;
  return (
    <section aria-labelledby="customer-transactions" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="customer-transactions" className="m-0 font-display text-section">
          {text.title}
        </h2>
        {total > 0 && (
          <span className="text-caption text-ink-muted">
            {text.summary(notPerformed, total)}
            {total > items.length && ` · ${text.latest(items.length)}`}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="m-0 rounded-md border border-line bg-surface p-5 text-ink-muted">
          {text.empty}
        </p>
      ) : (
        <DataTable
          caption={text.caption(customerId)}
          rows={items}
          rowKey={(item) => String(item.id)}
          columns={[
            {
              key: 'id',
              label: text.columns.id,
              align: 'right',
              mono: true,
              render: (item) => <span className="text-ink-faint">{item.id}</span>,
            },
            {
              key: 'created',
              label: text.columns.created,
              mono: true,
              render: (item) => formatDateTime(item.createdAt),
            },
            { key: 'type', label: text.columns.type, render: (item) => text.type[item.type] },
            {
              key: 'service',
              label: text.columns.service,
              mono: true,
              render: (item) => serviceNames.get(item.serviceId) ?? item.serviceId,
            },
            {
              key: 'status',
              label: text.columns.status,
              render: (item) =>
                item.status === 'performed' ? (
                  <span className="text-ink-muted">{text.status.performed}</span>
                ) : (
                  <StatusTag icon={CircleAlert} tone="negative" soft>
                    {text.status.not_performed}
                  </StatusTag>
                ),
            },
            {
              key: 'amount',
              label: text.columns.amount,
              align: 'right',
              mono: true,
              render: (item) => formatMoney(item.amount),
            },
          ]}
        />
      )}
    </section>
  );
}
