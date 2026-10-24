import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { apiClient, unwrap } from '@/shared/api/client';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { server } from '@/test/setup';

import { createQueryClient } from './query-client';
import { routes } from './router';
import { bindSessionExpiry } from './session-expiry';

const admin = { id: 1, login: 'admin', role: 'admin', authProvider: 'local' };

const problem = (status: number, code: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

describe('session expiry', () => {
  it('returns to the login page with a notice when refresh fails after sign in', async () => {
    let expired = false;
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json(admin)),
      http.get('*/api/v1/auth/providers', () =>
        HttpResponse.json({ local: { enabled: true }, oidc: { enabled: false } }),
      ),
      http.get('*/api/v1/customers', () =>
        expired ? problem(401, 'unauthenticated') : HttpResponse.json({}),
      ),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
    );
    const queryClient = createQueryClient();
    const router = createMemoryRouter(routes, { initialEntries: ['/model'] });
    bindSessionExpiry(queryClient);
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'меню пользователя' });

    expired = true;
    await expect(unwrap(apiClient.GET('/api/v1/customers'))).rejects.toMatchObject({ status: 401 });

    expect(await screen.findByText('сессия истекла, войдите снова')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/model');
  });

  it('stays quiet for a visitor who never signed in', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => problem(401, 'unauthenticated')),
      http.get('*/api/v1/auth/providers', () =>
        HttpResponse.json({ local: { enabled: true }, oidc: { enabled: false } }),
      ),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
    );
    const queryClient = createQueryClient();
    const router = createMemoryRouter(routes, { initialEntries: ['/model'] });
    bindSessionExpiry(queryClient);
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'вход' })).toBeInTheDocument();
    expect(router.state.location.search).not.toContain('expired');
    expect(screen.queryByText('сессия истекла, войдите снова')).not.toBeInTheDocument();
  });
});
