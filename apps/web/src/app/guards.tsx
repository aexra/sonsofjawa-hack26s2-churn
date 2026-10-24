import { Navigate, Outlet, useLocation } from 'react-router';

import { useSession } from '@/entities/session';
import { useResumeAfterSso } from '@/features/auth-login';
import { ForbiddenPage } from '@/pages/forbidden';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

function ResumeAfterSso() {
  useResumeAfterSso();
  return null;
}

export function RequireAuth() {
  const { user, isPending, isError, refetch, expired } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        kind="error"
        title={ru.common.loadFailed}
        text={ru.common.loadFailedText}
        action={<Button onClick={() => void refetch()}>{ru.common.retry}</Button>}
      />
    );
  }
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    const query = `${expired ? 'expired=1&' : ''}next=${encodeURIComponent(next)}`;
    return <Navigate to={`/login?${query}`} replace />;
  }
  return (
    <>
      <ResumeAfterSso />
      <Outlet />
    </>
  );
}

export function RequireAdmin() {
  const { isAdmin } = useSession();
  return isAdmin ? <Outlet /> : <ForbiddenPage />;
}
