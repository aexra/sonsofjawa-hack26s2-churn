import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CirclePause,
  CircleX,
  Clock,
  type LucideIcon,
} from 'lucide-react';

import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib/format';
import { plural } from '@/shared/lib/plural';
import { DataTable } from '@/shared/ui/data-table';
import { StatusTag } from '@/shared/ui/status-tag';

import type { CustomerService } from '@/entities/customer';

interface CustomerServicesProps {
  customerId: number;
  services: CustomerService[];
  horizonDays: number | undefined;
  graceDays: number | undefined;
}

const text = ru.customer.services;

const MS_PER_DAY = 86_400_000;

const STATUS_ICONS: Record<CustomerService['status'], LucideIcon> = {
  active: CircleCheck,
  suspended: CirclePause,
  prolong_wait: Clock,
  deleted: CircleX,
  blocked: CircleMinus,
};

const deadline = (service: CustomerService, graceDays: number) =>
  new Date(new Date(service.expiresAt).getTime() + graceDays * MS_PER_DAY);

const isDeadlineOverdue = (service: CustomerService, graceDays: number) =>
  service.daysLeft !== null && service.daysLeft !== undefined && service.daysLeft + graceDays < 0;

function Expiry({ service }: { service: CustomerService }) {
  const left = service.daysLeft;
  let suffix: string | null = null;
  if (service.isLive && left !== null && left !== undefined) {
    suffix = left <= 0 ? text.expired : text.daysLeft(Math.ceil(left));
  }
  return (
    <span>
      {formatDateTime(service.expiresAt)}
      {suffix && (
        <span className="font-sans text-ink-muted">
          {' · '}
          {suffix}
        </span>
      )}
    </span>
  );
}

export function CustomerServices({
  customerId,
  services,
  horizonDays,
  graceDays,
}: CustomerServicesProps) {
  const live = services.filter((service) => service.isLive).length;
  const blocked = services.filter((service) => service.status === 'blocked').length;
  const deleted = services.filter((service) => service.status === 'deleted').length;
  const aside =
    live > 0
      ? text.greyNote
      : [
          blocked > 0 ? text.blocked(blocked, plural(blocked, text.blockedForms)) : null,
          deleted > 0 ? text.deleted(deleted, plural(deleted, text.deletedForms)) : null,
        ]
          .filter((part) => part !== null)
          .join(' · ');
  const showDeadline = services.some((service) => service.status === 'prolong_wait');
  const dim = (service: CustomerService) => !service.isLive && 'text-ink-muted';

  return (
    <section aria-labelledby="customer-services" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="customer-services" className="m-0 font-display text-heading">
          {text.title}
        </h2>
        {services.length > 0 && (
          <span className="text-caption text-ink-muted">
            {text.live(live)}
            {aside && ` · ${aside}`}
          </span>
        )}
      </div>
      {services.length === 0 ? (
        <p className="m-0 rounded-md border border-line bg-surface p-4 text-ink-muted">
          {text.empty}
        </p>
      ) : (
        <DataTable
          caption={text.caption(customerId)}
          rows={services}
          rowKey={(service) => String(service.id)}
          columns={[
            {
              key: 'name',
              label: text.columns.name,
              mono: true,
              render: (service) => (
                <span className={cn('inline-flex flex-col gap-0.5', dim(service))}>
                  {service.name}
                  {service.atRisk && (
                    <StatusTag icon={CircleAlert} tone="negative">
                      {text.atRisk}
                    </StatusTag>
                  )}
                </span>
              ),
            },
            {
              key: 'status',
              label: text.columns.status,
              render: (service) => (
                <StatusTag
                  icon={STATUS_ICONS[service.status]}
                  tone={
                    service.status === 'prolong_wait'
                      ? 'warning'
                      : service.isLive
                        ? 'default'
                        : 'muted'
                  }
                >
                  {text.status[service.status]}
                </StatusTag>
              ),
            },
            {
              key: 'term',
              label: text.columns.term,
              render: (service) => (
                <span className={cn(dim(service))}>{text.term[service.paymentTerm]}</span>
              ),
            },
            {
              key: 'autoProlong',
              label: text.columns.autoProlong,
              render: (service) =>
                service.autoProlong ? (
                  <span className={cn(dim(service))}>{text.yes}</span>
                ) : service.isLive ? (
                  <StatusTag icon={CircleAlert} tone="negative">
                    {text.no}
                  </StatusTag>
                ) : (
                  <span className="text-ink-muted">{text.no}</span>
                ),
            },
            {
              key: 'expires',
              label: text.columns.expires,
              align: 'right',
              mono: true,
              render: (service) => (
                <span className={cn(dim(service))}>
                  <Expiry service={service} />
                </span>
              ),
            },
            ...(showDeadline
              ? [
                  {
                    key: 'deadline',
                    label: text.columns.deadline,
                    align: 'right' as const,
                    mono: true,
                    render: (service: CustomerService) =>
                      service.status !== 'prolong_wait' || graceDays === undefined ? null : (
                        <span
                          className={cn(isDeadlineOverdue(service, graceDays) && 'text-risk-high')}
                        >
                          {formatDate(deadline(service, graceDays))}
                        </span>
                      ),
                  },
                ]
              : []),
            {
              key: 'price',
              label: text.columns.price,
              align: 'right',
              mono: true,
              render: (service) => (
                <span className={cn(dim(service))}>{formatMoney(service.price)}</span>
              ),
            },
            {
              key: 'revenue',
              label:
                horizonDays === undefined
                  ? ru.customers.fields.revenueHorizon
                  : text.columns.revenue(horizonDays),
              align: 'right',
              mono: true,
              render: (service) =>
                service.revenueHorizon === undefined || !service.isLive ? (
                  <span className="text-ink-muted">{ru.common.emptyValue}</span>
                ) : (
                  <b className="font-semibold">{formatMoney(service.revenueHorizon)}</b>
                ),
            },
          ]}
        />
      )}
    </section>
  );
}
