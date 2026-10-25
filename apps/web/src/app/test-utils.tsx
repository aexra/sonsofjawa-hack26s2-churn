import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';

import { Toaster } from '@/shared/ui/toaster';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { createQueryClient } from './query-client';
import { routes } from './router';

export const stubChartSize = (width: number, height: number) =>
  vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, width, height));

export const admin = { id: 1, login: 'admin', role: 'admin', authProvider: 'local' };
export const analyst = { id: 2, login: 'analyst', role: 'user', authProvider: 'local' };

export const problem = (status: number, code: string, extra: object = {}) =>
  HttpResponse.json(
    { type: 'about:blank', title: code, status, code, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

export const signedInAs = (user: object) => [
  http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
];

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 } });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return router;
}
