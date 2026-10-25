import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useMatches } from 'react-router';

import { useSession } from '@/entities/session';
import { ru } from '@/shared/i18n/ru';

import { MobileNav } from './mobile-nav';
import { ModelClock } from './model-clock';
import { Sidebar } from './sidebar';
import { UserMenu } from './user-menu';

import type { ReactNode } from 'react';

export interface RouteHandle {
  title: string;
  adminOnly?: boolean;
}

const isRouteHandle = (value: unknown): value is RouteHandle =>
  typeof value === 'object' && value !== null && 'title' in value;

export interface PageHeading {
  title: string;
  detail?: string;
  backTo?: string;
  backLabel?: string;
}

const PageHeadingContext = createContext<(heading: PageHeading | null) => void>(() => undefined);

export function usePageHeading({ title, detail, backTo, backLabel }: PageHeading) {
  const setHeading = useContext(PageHeadingContext);
  useEffect(() => {
    setHeading({ title, detail, backTo, backLabel });
    return () => {
      setHeading(null);
    };
  }, [setHeading, title, detail, backTo, backLabel]);
}

interface AppShellProps {
  headerStatus?: ReactNode;
  headerActions?: ReactNode;
}

export function AppShell({ headerStatus, headerActions }: AppShellProps) {
  const [heading, setHeading] = useState<PageHeading | null>(null);
  return (
    <PageHeadingContext.Provider value={setHeading}>
      <AppShellFrame headerStatus={headerStatus} headerActions={headerActions} heading={heading} />
    </PageHeadingContext.Provider>
  );
}

interface AppShellFrameProps extends AppShellProps {
  heading: PageHeading | null;
}

function AppShellFrame({ headerStatus, headerActions, heading }: AppShellFrameProps) {
  const { user, isAdmin } = useSession();
  const handle = useMatches()
    .map((match) => match.handle)
    .filter(isRouteHandle)
    .at(-1);
  const denied = Boolean(handle?.adminOnly) && !isAdmin;
  const pageTitle = denied ? ru.forbidden.title : (heading?.title ?? handle?.title);
  const title = pageTitle ?? ru.app.title;

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${ru.app.title}` : ru.app.title;
  }, [pageTitle]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip md:flex-row">
      <MobileNav isAdmin={isAdmin} />
      <Sidebar isAdmin={isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-header flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-canvas px-4 py-3 md:px-8">
          <div className="mr-auto flex min-w-0 flex-col">
            {heading?.backTo && (
              <Link to={heading.backTo} className="text-caption text-accent hover:text-ink">
                ← {heading.backLabel}
              </Link>
            )}
            <h1 className="m-0 font-display text-title text-ink">
              {title}
              {heading?.detail && (
                <>
                  {' '}
                  <span className="font-mono text-heading font-normal text-ink-muted">
                    {heading.detail}
                  </span>
                </>
              )}
            </h1>
          </div>
          <ModelClock />
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {headerStatus}
            {headerActions}
            {user && (
              <UserMenu login={user.login} role={user.role} authProvider={user.authProvider} />
            )}
          </div>
        </header>
        <main className="mx-auto box-border flex w-full max-w-content-max min-w-0 flex-1 flex-col gap-6 overflow-x-clip p-4 md:px-8 md:pt-7 md:pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
