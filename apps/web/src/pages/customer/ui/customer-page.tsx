import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import { listPathFrom, useCustomer, type CustomerDetails } from '@/entities/customer';
import { findSettingValue, useModelSettings } from '@/entities/model-settings';
import { ApiError } from '@/shared/api/api-error';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { Button, buttonVariants } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { usePageHeading } from '@/widgets/app-shell';
import { CustomerMoney } from '@/widgets/customer-money';
import { CustomerReasons } from '@/widgets/customer-reasons';
import { CustomerServices } from '@/widgets/customer-services';
import { ScoreHistory } from '@/widgets/score-history';

import { AnomaliesBanner } from './anomalies-banner';
import { BalanceCard } from './balance-card';
import { CustomerSkeleton } from './customer-skeleton';
import { ScoreCard } from './score-card';
import { Transactions } from './transactions';

const text = ru.customer;

const parseId = (raw: string | undefined): number | null =>
  raw !== undefined && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;

function NotFound({ id, listPath }: { id: string; listPath: string }) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        kind="empty"
        title={text.notFound}
        text={text.notFoundText(id)}
        action={
          <Link to={listPath} className={buttonVariants()}>
            {text.back}
          </Link>
        }
      />
    </div>
  );
}

function CustomerContent({ id, details }: { id: number; details: CustomerDetails }) {
  const { account, score, services, transactions } = details;
  const graceDays = findSettingValue(useModelSettings().data, 'grace_days');
  const serviceNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services],
  );
  const scored = score.status === 'scored';

  return (
    <div className="flex flex-col gap-4">
      <AnomaliesBanner anomalies={score.anomalies} services={services} graceDays={graceDays} />
      <div
        className={
          scored
            ? 'grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4'
            : 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]'
        }
      >
        <ScoreCard score={score} />
        {scored && <CustomerMoney score={score} />}
        <BalanceCard account={account} />
      </div>
      {scored && <CustomerReasons score={score} />}
      <CustomerServices
        customerId={id}
        services={services}
        horizonDays={score.horizonDays}
        graceDays={graceDays}
      />
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[3_1_560px]">
          <Transactions customerId={id} transactions={transactions} serviceNames={serviceNames} />
        </div>
        <div className="min-w-0 flex-[2_1_300px]">
          <ScoreHistory customerId={id} />
        </div>
      </div>
    </div>
  );
}

function CustomerView({ id }: { id: number }) {
  const customer = useCustomer(id);
  const { state } = useLocation();
  const listPath = listPathFrom(state);
  const error = customer.error;
  const notFound = error instanceof ApiError && error.status === 404;

  usePageHeading({
    title: text.title(String(id)),
    detail: customer.data?.account.email,
    backTo: listPath,
    backLabel: text.back,
  });

  if (notFound) return <NotFound id={String(id)} listPath={listPath} />;
  if (customer.isError) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState
          kind="error"
          title={ru.common.loadFailed}
          text={errorMessage(error)}
          action={<Button onClick={() => void customer.refetch()}>{ru.common.retry}</Button>}
        />
      </div>
    );
  }
  if (customer.isPending) return <CustomerSkeleton />;
  return <CustomerContent id={id} details={customer.data} />;
}

export function CustomerPage() {
  const { id: raw } = useParams();
  const { state } = useLocation();
  const id = parseId(raw);
  if (id === null) return <NotFound id={raw ?? ''} listPath={listPathFrom(state)} />;
  return <CustomerView id={id} />;
}
