import { useEffect } from 'react';
import { Outlet, useMatches } from 'react-router';

import { useSession } from '@/entities/session';
import { ru } from '@/shared/i18n/ru';

import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';

export interface RouteHandle {
  title: string;
  adminOnly?: boolean;
}

const isRouteHandle = (value: unknown): value is RouteHandle =>
  typeof value === 'object' && value !== null && 'title' in value;

export function AppShell() {
  const { user, isAdmin } = useSession();
  const handle = useMatches()
    .map((match) => match.handle)
    .filter(isRouteHandle)
    .at(-1);
  const denied = Boolean(handle?.adminOnly) && !isAdmin;
  const pageTitle = denied ? ru.forbidden.title : handle?.title;
  const title = pageTitle ?? ru.app.title;

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${ru.app.title}` : ru.app.title;
  }, [pageTitle]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-header flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-6 py-2">
          <h1 className="m-0 font-display text-title text-ink">{title}</h1>
          {user && <UserMenu login={user.login} role={user.role} />}
        </header>
        <main className="mx-auto box-border w-full max-w-content-max min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
