import { TriangleAlert } from 'lucide-react';

import { ru } from '@/shared/i18n/ru';
import { Tooltip } from '@/shared/ui/tooltip';

import type { CustomerAnomaly, CustomerService } from '@/entities/customer';

interface AnomaliesBannerProps {
  anomalies: CustomerAnomaly[];
  services: CustomerService[];
  graceDays: number | undefined;
}

const text = ru.customer.anomalies;

const names = (services: CustomerService[]) => services.map((service) => service.name).join(', ');

const detail = (
  anomaly: CustomerAnomaly,
  services: CustomerService[],
  graceDays: number | undefined,
): string | null => {
  switch (anomaly) {
    case 'expired_but_live': {
      const affected = services.filter(
        (service) =>
          service.isLive &&
          service.status !== 'prolong_wait' &&
          service.daysLeft !== null &&
          service.daysLeft !== undefined &&
          service.daysLeft < 0,
      );
      return affected.length > 0 ? text.expired_but_live.text(names(affected)) : null;
    }
    case 'overdue_prolong_wait': {
      if (graceDays === undefined) return null;
      const affected = services.filter(
        (service) =>
          service.status === 'prolong_wait' &&
          service.daysLeft !== null &&
          service.daysLeft !== undefined &&
          service.daysLeft + graceDays < 0,
      );
      return affected.length > 0
        ? text.overdue_prolong_wait.text(names(affected), graceDays)
        : null;
    }
    case 'withdraw_exceeds_balance':
      return text.withdraw_exceeds_balance.text();
    case 'balance_exceeds_replenished':
      return text.balance_exceeds_replenished.text();
  }
};

export function AnomaliesBanner({ anomalies, services, graceDays }: AnomaliesBannerProps) {
  if (anomalies.length === 0) return null;
  const details = anomalies.map((anomaly) => detail(anomaly, services, graceDays));
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-risk-medium-fill bg-risk-medium-soft px-4 py-3"
    >
      <Tooltip content={text.hint}>
        <button
          type="button"
          aria-label={text.hint}
          className="inline-flex cursor-help border-0 bg-transparent p-0 pt-0.5 text-risk-medium"
        >
          <TriangleAlert aria-hidden="true" className="size-4" />
        </button>
      </Tooltip>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="font-semibold">
          {text.heading(anomalies.map((anomaly) => text[anomaly].title).join('; '))}
        </b>
        <span className="text-ink-muted">
          {details.filter((value) => value !== null).join(' ')} {text.outro}
        </span>
      </div>
    </div>
  );
}
