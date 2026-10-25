import { createBrowserRouter, type RouteObject } from 'react-router';

import { AccessKeysPage } from '@/pages/access-keys';
import { AccessUsersPage } from '@/pages/access-users';
import { CustomerPage } from '@/pages/customer';
import { CustomersPage } from '@/pages/customers';
import { DataPage } from '@/pages/data';
import { LoginPage } from '@/pages/login';
import { ModelPage } from '@/pages/model';
import { NotFoundPage } from '@/pages/not-found';
import { OverviewPage } from '@/pages/overview';
import { ru } from '@/shared/i18n/ru';
import { AppShell, type RouteHandle } from '@/widgets/app-shell';
import { AssistantPanel } from '@/widgets/assistant-panel';
import { RecalcIndicator } from '@/widgets/recalc-indicator';

import { RequireAdmin, RequireAuth } from './guards';

const handle = (title: string, adminOnly = false): RouteHandle => ({ title, adminOnly });

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell headerStatus={<RecalcIndicator />} headerActions={<AssistantPanel />} />,
        children: [
          { index: true, element: <OverviewPage />, handle: handle(ru.pages.overview) },
          { path: 'customers', element: <CustomersPage />, handle: handle(ru.pages.customers) },
          { path: 'customers/:id', element: <CustomerPage />, handle: handle(ru.pages.customer) },
          { path: 'model', element: <ModelPage />, handle: handle(ru.pages.model) },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'data', element: <DataPage />, handle: handle(ru.pages.data, true) },
              {
                path: 'access/keys',
                element: <AccessKeysPage />,
                handle: handle(ru.pages.apiKeys, true),
              },
              {
                path: 'access/users',
                element: <AccessUsersPage />,
                handle: handle(ru.pages.users, true),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
