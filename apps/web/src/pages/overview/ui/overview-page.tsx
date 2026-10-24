import { Link } from 'react-router';

import { useAnalyticsSummary } from '@/entities/analytics';
import { useSession } from '@/entities/session';
import { ru } from '@/shared/i18n/ru';
import { buttonVariants } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { ChurnChart } from '@/widgets/churn-chart';
import { KpiPanel } from '@/widgets/kpi-panel';
import { RiskDistribution } from '@/widgets/risk-distribution';
import { TopCustomers } from '@/widgets/top-customers';
import { TopReasons } from '@/widgets/top-reasons';

function NoData() {
  const { isAdmin } = useSession();
  const text = ru.overview.empty;
  return (
    <div className="rounded-md border border-line bg-surface">
      <EmptyState
        kind="empty"
        title={text.title}
        text={isAdmin ? text.text : text.textUser}
        action={
          isAdmin && (
            <Link to="/data" className={buttonVariants({ variant: 'primary' })}>
              {text.action}
            </Link>
          )
        }
      />
    </div>
  );
}

export function OverviewPage() {
  const summary = useAnalyticsSummary();

  if (summary.data?.accounts.total === 0) {
    return <NoData />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <KpiPanel />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        <RiskDistribution />
        <TopReasons />
      </div>
      <ChurnChart />
      <TopCustomers />
    </div>
  );
}
