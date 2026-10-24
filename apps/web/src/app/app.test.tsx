import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/shared/ui/tooltip';
import { server } from '@/test/setup';

import { createQueryClient } from './query-client';
import { routes } from './router';

const admin = { id: 1, login: 'admin', role: 'admin', authProvider: 'local' };
const analyst = { id: 2, login: 'analyst', role: 'user', authProvider: 'local' };

const problem = (status: number, code: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

const localLogin = http.get('*/api/v1/auth/providers', () =>
  HttpResponse.json({ local: { enabled: true }, oidc: { enabled: false } }),
);

const signedInAs = (user: object) => [http.get('*/api/v1/auth/me', () => HttpResponse.json(user))];

const signedOut = [
  http.get('*/api/v1/auth/me', () => problem(401, 'unauthenticated')),
  http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
  localLogin,
];

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('route guards', () => {
  it('sends an anonymous visitor to the login page and remembers the target', async () => {
    server.use(...signedOut);
    const router = renderAt('/customers?level=high');

    expect(await screen.findByRole('heading', { name: 'вход' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe(
      '/customers?level=high',
    );
  });

  it('shows the full menu to an administrator', async () => {
    server.use(...signedInAs(admin));
    renderAt('/');

    const nav = await screen.findByRole('navigation', { name: 'основная навигация' });
    for (const name of ['обзор', 'клиенты', 'модель', 'данные', 'ключи API', 'пользователи']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).getByText('администрирование')).toBeInTheDocument();
    expect(within(nav).getByText('справка')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /документация API/ })).toBeInTheDocument();
  });

  it('hides the administration group from an analyst', async () => {
    server.use(...signedInAs(analyst));
    renderAt('/');

    const nav = await screen.findByRole('navigation', { name: 'основная навигация' });
    expect(within(nav).getByRole('link', { name: 'модель' })).toBeInTheDocument();
    expect(within(nav).queryByText('администрирование')).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'данные' })).not.toBeInTheDocument();
    expect(within(nav).getByText('справка')).toBeInTheDocument();
  });

  it('shows the no-access screen to an analyst on an admin route', async () => {
    server.use(...signedInAs(analyst));
    renderAt('/data');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'нет доступа' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('нет доступа · анализатор рисков оттока');
    expect(screen.getByText('этот раздел доступен администратору')).toBeInTheDocument();
  });

  it('opens admin routes for an administrator', async () => {
    server.use(...signedInAs(admin));
    renderAt('/access/keys');

    expect(await screen.findByRole('heading', { level: 1, name: 'ключи API' })).toBeInTheDocument();
    expect(screen.queryByText('нет доступа')).not.toBeInTheDocument();
  });

  it('shows the not-found screen for an unknown path', async () => {
    server.use(...signedInAs(admin));
    renderAt('/nowhere');

    expect(await screen.findByRole('heading', { name: 'страница не найдена' })).toBeInTheDocument();
  });
});

describe('login page', () => {
  it('signs in and returns to the requested page', async () => {
    let signedIn = false;
    server.use(
      http.get('*/api/v1/auth/me', () =>
        signedIn ? HttpResponse.json(admin) : problem(401, 'unauthenticated'),
      ),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
      http.post('*/api/v1/auth/login', async ({ request }) => {
        const body = (await request.json()) as { login: string; password: string };
        expect(body).toEqual({ login: 'admin', password: 'admin12345' });
        signedIn = true;
        return HttpResponse.json(admin);
      }),
      localLogin,
    );
    const router = renderAt('/data');

    await userEvent.type(await screen.findByLabelText('логин'), 'admin');
    await userEvent.type(screen.getByLabelText('пароль'), 'admin12345');
    await userEvent.click(screen.getByRole('button', { name: 'войти' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'данные' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/data');
  });

  it('reports a wrong password under the form', async () => {
    server.use(
      ...signedOut,
      http.post('*/api/v1/auth/login', () => problem(401, 'invalid_credentials')),
    );
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText('логин'), 'admin');
    await userEvent.type(screen.getByLabelText('пароль'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('неверный логин или пароль');
  });

  it('reports a disabled account', async () => {
    server.use(
      ...signedOut,
      http.post('*/api/v1/auth/login', () => problem(403, 'account_disabled')),
    );
    renderAt('/login');

    await userEvent.type(await screen.findByLabelText('логин'), 'admin');
    await userEvent.type(screen.getByLabelText('пароль'), 'admin12345');
    await userEvent.click(screen.getByRole('button', { name: 'войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('учётная запись отключена');
  });

  it('asks for both fields before sending', async () => {
    server.use(...signedOut);
    renderAt('/login');

    await userEvent.click(await screen.findByRole('button', { name: 'войти' }));

    expect(await screen.findByText('укажите логин')).toBeInTheDocument();
    expect(screen.getByText('укажите пароль')).toBeInTheDocument();
  });

  it('shows no form when password login is turned off', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => problem(401, 'unauthenticated')),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
      http.get('*/api/v1/auth/providers', () =>
        HttpResponse.json({
          local: { enabled: false },
          oidc: { enabled: true, displayName: 'Keycloak', loginUrl: '/api/v1/auth/oidc/login' },
        }),
      ),
    );
    renderAt('/login');

    expect(await screen.findByText('вход по паролю отключён')).toBeInTheDocument();
    expect(screen.queryByLabelText('логин')).not.toBeInTheDocument();
  });

  it('explains an expired session and a rejected sso login', async () => {
    server.use(...signedOut);
    renderAt('/login?expired=1&error=forbidden');

    expect(await screen.findByText('сессия истекла, войдите снова')).toBeInTheDocument();
    expect(screen.getByText('у вашей учётной записи нет доступа к панели')).toBeInTheDocument();
  });

  it('redirects a signed in user away from the login page', async () => {
    server.use(...signedInAs(admin), localLogin);
    const router = renderAt('/login?next=%2Fmodel');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/model');
    });
  });

  it('ignores an external next target', async () => {
    server.use(...signedInAs(admin), localLogin);
    const router = renderAt('/login?next=%2F%2Fevil.test');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});

describe('user menu', () => {
  it('shows the login and role and switches the theme', async () => {
    server.use(...signedInAs(admin));
    renderAt('/');

    const trigger = await screen.findByRole('button', { name: 'меню пользователя' });
    expect(trigger).toHaveTextContent('admin · администратор');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'тёмная' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    delete document.documentElement.dataset.theme;
    window.localStorage.clear();
  });

  it('logs out and returns to the login page', async () => {
    let signedIn = true;
    server.use(
      http.get('*/api/v1/auth/me', () =>
        signedIn ? HttpResponse.json(admin) : problem(401, 'unauthenticated'),
      ),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
      http.post('*/api/v1/auth/logout', () => {
        signedIn = false;
        return new HttpResponse(null, { status: 204 });
      }),
      localLogin,
    );
    const router = renderAt('/model');

    await userEvent.click(await screen.findByRole('button', { name: 'меню пользователя' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'выйти' }));

    expect(await screen.findByRole('heading', { name: 'вход' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});
