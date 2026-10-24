import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/test/setup';

import { admin, problem, renderAt, signedInAs } from './test-utils';

const keycloak = {
  enabled: true,
  displayName: 'Keycloak',
  loginUrl: '/api/v1/auth/oidc/login',
};

const providers = (body: object) =>
  http.get('*/api/v1/auth/providers', () => HttpResponse.json(body));

const signedOut = [
  http.get('*/api/v1/auth/me', () => problem(401, 'unauthenticated')),
  http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
];

const bothMethods = providers({ local: { enabled: true }, oidc: keycloak });
const ssoOnly = providers({ local: { enabled: false }, oidc: keycloak });

const blockNavigation = (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
};

beforeEach(() => {
  document.addEventListener('click', blockNavigation);
});

afterEach(() => {
  document.removeEventListener('click', blockNavigation);
  window.sessionStorage.clear();
});

describe('login page with sso', () => {
  it('offers both the password form and the sso button', async () => {
    server.use(...signedOut, bothMethods);
    renderAt('/login');

    const link = await screen.findByRole('link', { name: 'войти через Keycloak' });
    expect(link).toHaveAttribute('href', '/api/v1/auth/oidc/login');
    expect(screen.getByLabelText('логин')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'войти' })).toBeInTheDocument();
    expect(screen.getByText('или')).toBeInTheDocument();
    expect(link).toHaveClass('border-line-strong');
  });

  it('shows no sso button when the provider is not configured', async () => {
    server.use(...signedOut, providers({ local: { enabled: true }, oidc: { enabled: false } }));
    renderAt('/login');

    expect(await screen.findByLabelText('логин')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /войти через/ })).not.toBeInTheDocument();
    expect(screen.queryByText('или')).not.toBeInTheDocument();
  });

  it('shows only the sso button when password login is turned off', async () => {
    server.use(...signedOut, ssoOnly);
    renderAt('/login');

    const link = await screen.findByRole('link', { name: 'войти через Keycloak' });
    expect(link).toHaveClass('bg-accent');
    expect(screen.getByText('вход по паролю отключён')).toBeInTheDocument();
    expect(screen.queryByLabelText('логин')).not.toBeInTheDocument();
    expect(screen.queryByText('или')).not.toBeInTheDocument();
  });

  it('explains a rejected sso login and offers another attempt', async () => {
    server.use(...signedOut, ssoOnly);
    renderAt('/login?error=forbidden');

    await screen.findByRole('link', { name: 'войти через Keycloak' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'у вашей учётной записи нет доступа к панели',
    );
    expect(
      screen.getByText(
        'попросите администратора выдать роль в Keycloak или войдите другой учётной записью.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('вход по паролю отключён')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'войти через Keycloak' })).toHaveClass(
      'border-line-strong',
    );
  });

  it('explains an unavailable provider', async () => {
    server.use(...signedOut, bothMethods);
    renderAt('/login?error=provider');

    expect(await screen.findByLabelText('логин')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'сервис входа недоступен, попробуйте позже',
    );
  });

  it('remembers the requested page before leaving for the provider', async () => {
    server.use(...signedOut, bothMethods);
    renderAt('/customers?level=high');

    await userEvent.click(await screen.findByRole('link', { name: 'войти через Keycloak' }));

    expect(window.sessionStorage.getItem('login-next')).toBe('/customers?level=high');
  });

  it('keeps the remembered page when the provider sends the user back with an error', async () => {
    window.sessionStorage.setItem('login-next', '/model');
    server.use(...signedOut, bothMethods);
    renderAt('/login?error=forbidden');

    await userEvent.click(await screen.findByRole('link', { name: 'войти через Keycloak' }));

    expect(window.sessionStorage.getItem('login-next')).toBe('/model');
  });

  it('does not remember an external target', async () => {
    server.use(...signedOut, bothMethods);
    renderAt('/login?next=%2F%2Fevil.test');

    await userEvent.click(await screen.findByRole('link', { name: 'войти через Keycloak' }));

    expect(window.sessionStorage.getItem('login-next')).toBe('/');
  });
});

describe('return after sso', () => {
  it('opens the remembered page once the session is established', async () => {
    window.sessionStorage.setItem('login-next', '/model');
    server.use(...signedInAs(admin), bothMethods);
    const router = renderAt('/');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/model');
    });
    expect(window.sessionStorage.getItem('login-next')).toBeNull();
  });

  it('ignores a remembered external target', async () => {
    window.sessionStorage.setItem('login-next', '//evil.test');
    server.use(...signedInAs(admin));
    const router = renderAt('/');

    await screen.findByRole('navigation', { name: 'основная навигация' });
    expect(router.state.location.pathname).toBe('/');
    expect(window.sessionStorage.getItem('login-next')).toBeNull();
  });

  it('forgets the remembered page after a password login', async () => {
    window.sessionStorage.setItem('login-next', '/model');
    let signedIn = false;
    server.use(
      http.get('*/api/v1/auth/me', () =>
        signedIn ? HttpResponse.json(admin) : problem(401, 'unauthenticated'),
      ),
      http.post('*/api/v1/auth/refresh', () => problem(401, 'refresh_invalid')),
      http.post('*/api/v1/auth/login', () => {
        signedIn = true;
        return HttpResponse.json(admin);
      }),
      bothMethods,
    );
    const router = renderAt('/login');

    await userEvent.type(await screen.findByLabelText('логин'), 'admin');
    await userEvent.type(screen.getByLabelText('пароль'), 'admin12345');
    await userEvent.click(screen.getByRole('button', { name: 'войти' }));

    await screen.findByRole('navigation', { name: 'основная навигация' });
    expect(router.state.location.pathname).toBe('/');
    expect(window.sessionStorage.getItem('login-next')).toBeNull();
  });
});

describe('user menu sign-in method', () => {
  it('names sso for a provider user', async () => {
    server.use(...signedInAs({ ...admin, authProvider: 'oidc' }));
    renderAt('/');

    await userEvent.click(await screen.findByRole('button', { name: 'меню пользователя' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('способ входа: SSO')).toBeInTheDocument();
  });

  it('names the password for a local user', async () => {
    server.use(...signedInAs(admin));
    renderAt('/');

    await userEvent.click(await screen.findByRole('button', { name: 'меню пользователя' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('способ входа: пароль')).toBeInTheDocument();
  });
});
