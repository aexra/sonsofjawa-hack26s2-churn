import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/setup';

import { admin, problem, renderAt, signedInAs } from './test-utils';

interface KeyRow {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const key = (overrides: Partial<KeyRow>): KeyRow => ({
  id: 1,
  name: 'биллинг',
  prefix: 'a1b2c3d4',
  scopes: ['ingest'],
  createdBy: 'admin',
  createdAt: '2026-10-19T14:50:00Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  ...overrides,
});

const SECRET = 'ck_7c1e9a40_q7Zt3mK9pX2vR8nB4wL6yH1sD5fG0jCe';

describe('api keys page', () => {
  it('lists keys with their status and offers revoking only for active ones', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () =>
        HttpResponse.json([
          key({ id: 3, name: 'prometheus', prefix: '9f8e7d6c', scopes: ['metrics'] }),
          key({ id: 2, name: 'отчёты', prefix: '5e4d3c2b', revokedAt: '2026-10-12T18:30:00Z' }),
          key({ id: 1, name: 'демо', prefix: '0a1b2c3d', expiresAt: '2020-01-01T00:00:00Z' }),
        ]),
      ),
    );
    renderAt('/access/keys');

    const table = await screen.findByRole('table', { name: 'ключи API' });
    expect(within(table).getByText('ck_9f8e7d6c…')).toBeInTheDocument();
    expect(within(table).getByText('активен')).toBeInTheDocument();
    expect(within(table).getByText('отозван')).toBeInTheDocument();
    expect(within(table).getByText('истёк')).toBeInTheDocument();
    expect(within(table).getByText('метрики')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'отозвать' })).toHaveLength(1);
  });

  it('shows an empty state when there are no keys', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () => HttpResponse.json([])),
    );
    renderAt('/access/keys');

    expect(await screen.findByText('ключей пока нет')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'выпустить ключ' })).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    let attempts = 0;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () => {
        attempts += 1;
        return attempts === 1 ? problem(500, 'internal') : HttpResponse.json([key({})]);
      }),
    );
    renderAt('/access/keys');

    await userEvent.click(await screen.findByRole('button', { name: 'повторить' }));

    expect(await screen.findByText('биллинг')).toBeInTheDocument();
  });

  it('shows the secret once and copies it', async () => {
    const user = userEvent.setup();
    const keys: KeyRow[] = [];
    let received: unknown;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () => HttpResponse.json(keys)),
      http.post('*/api/v1/admin/api-keys', async ({ request }) => {
        received = await request.json();
        const created = key({
          id: 5,
          name: 'интеграция crm',
          prefix: '7c1e9a40',
          scopes: ['read'],
        });
        keys.push(created);
        return HttpResponse.json({ key: created, secret: SECRET }, { status: 201 });
      }),
    );
    renderAt('/access/keys');

    await user.click(await screen.findByRole('button', { name: 'выпустить ключ' }));
    const form = await screen.findByRole('dialog', { name: 'выпустить ключ' });
    await user.type(within(form).getByLabelText('название'), 'интеграция crm');
    await user.click(within(form).getByRole('checkbox', { name: 'чтение' }));
    await user.click(within(form).getByRole('button', { name: 'выпустить' }));

    const issued = await screen.findByRole('dialog', { name: 'ключ «интеграция crm» выпущен' });
    expect(received).toEqual({ name: 'интеграция crm', scopes: ['read'] });
    expect(within(issued).getByLabelText('ключ')).toHaveValue(SECRET);
    expect(within(issued).getByRole('alert')).toHaveTextContent(
      'ключ показывается один раз — сохраните его. потом будет виден только префикс ck_7c1e9a40.',
    );
    await user.click(within(issued).getByRole('button', { name: 'скопировать' }));
    expect(await navigator.clipboard.readText()).toBe(SECRET);

    await user.click(within(issued).getByRole('button', { name: 'я сохранил ключ' }));

    expect(screen.queryByDisplayValue(SECRET)).not.toBeInTheDocument();
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(await screen.findByText('ck_7c1e9a40…')).toBeInTheDocument();
  });

  it('asks for a name and at least one permission before issuing', async () => {
    let requests = 0;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () => HttpResponse.json([])),
      http.post('*/api/v1/admin/api-keys', () => {
        requests += 1;
        return problem(500, 'internal');
      }),
    );
    renderAt('/access/keys');

    await userEvent.click(await screen.findByRole('button', { name: 'выпустить ключ' }));
    const form = await screen.findByRole('dialog');
    await userEvent.click(within(form).getByRole('button', { name: 'выпустить' }));

    expect(await within(form).findByText('укажите название')).toBeInTheDocument();
    expect(within(form).getByText('выберите хотя бы одно право')).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('rejects an expiry date in the past', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () => HttpResponse.json([])),
    );
    renderAt('/access/keys');

    await userEvent.click(await screen.findByRole('button', { name: 'выпустить ключ' }));
    const form = await screen.findByRole('dialog');
    await userEvent.type(within(form).getByLabelText('название'), 'старый');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'метрики' }));
    await userEvent.type(within(form).getByLabelText('срок действия'), '2020-01-01');
    await userEvent.click(within(form).getByRole('button', { name: 'выпустить' }));

    expect(await within(form).findByText('срок должен быть в будущем')).toBeInTheDocument();
  });

  it('revokes a key after confirmation', async () => {
    const keys = [key({ id: 4 })];
    let revoked: string | undefined;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/api-keys', () => HttpResponse.json(keys)),
      http.delete('*/api/v1/admin/api-keys/:id', ({ params }) => {
        revoked = String(params.id);
        keys[0] = key({ id: 4, revokedAt: '2026-10-19T15:00:00Z' });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt('/access/keys');

    await userEvent.click(await screen.findByRole('button', { name: 'отозвать' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'отозвать ключ «биллинг»?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'отозвать' }));

    expect(await screen.findByText('ключ отозван')).toBeInTheDocument();
    expect(revoked).toBe('4');
    expect(await screen.findByText('отозван')).toBeInTheDocument();
  });
});

interface UserRow {
  id: number;
  login: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'user';
  authProvider: 'local' | 'oidc';
  enabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const person = (overrides: Partial<UserRow>): UserRow => ({
  id: 2,
  login: 'analyst',
  displayName: 'аналитик',
  email: null,
  role: 'user',
  authProvider: 'local',
  enabled: true,
  createdAt: '2026-10-01T10:00:00Z',
  lastLoginAt: '2026-10-19T13:40:00Z',
  ...overrides,
});

const people = (): UserRow[] => [
  person({ id: 1, login: 'admin', displayName: 'администратор', role: 'admin' }),
  person({}),
  person({
    id: 3,
    login: 'm.orlova',
    displayName: 'Мария Орлова',
    email: 'm.orlova@example.test',
    authProvider: 'oidc',
  }),
  person({ id: 4, login: 'reports', displayName: 'выгрузки', enabled: false }),
];

function rowOf(login: string) {
  const row = screen
    .getAllByRole('row')
    .find((item) => item.querySelector('td')?.textContent.startsWith(login));
  if (!row) throw new Error(`row ${login} not found`);
  return within(row);
}

describe('users page', () => {
  it('marks the current user and blocks self disabling and deleting', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    const self = rowOf('admin');
    expect(self.getByText('вы')).toBeInTheDocument();
    expect(self.getByRole('button', { name: 'отключить' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(self.getByRole('button', { name: 'удалить' })).toHaveAttribute('aria-disabled', 'true');
    const other = rowOf('analyst');
    expect(other.getByRole('button', { name: 'отключить' })).not.toHaveAttribute('aria-disabled');
    expect(rowOf('reports').getByRole('button', { name: 'включить' })).toBeInTheDocument();
  });

  it('explains that the role of a sso user is managed by the provider', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    const sso = rowOf('m.orlova');
    expect(sso.getByText('SSO')).toBeInTheDocument();
    expect(sso.getByRole('button', { name: 'роль управляется в Keycloak' })).toBeInTheDocument();
  });

  it('creates a user with a normalized request body', async () => {
    const list = people();
    let received: unknown;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(list)),
      http.post('*/api/v1/admin/users', async ({ request }) => {
        received = await request.json();
        const created = person({ id: 9, login: 'analyst2', displayName: null });
        list.push(created);
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderAt('/access/users');

    await userEvent.click(await screen.findByRole('button', { name: 'создать пользователя' }));
    const form = await screen.findByRole('dialog', { name: 'создать пользователя' });
    await userEvent.type(within(form).getByLabelText('логин'), 'analyst2');
    await userEvent.type(within(form).getByLabelText('пароль'), 'analyst2pass');
    await userEvent.click(within(form).getByRole('button', { name: 'создать' }));

    expect(await screen.findByText('пользователь создан')).toBeInTheDocument();
    expect(received).toEqual({ login: 'analyst2', password: 'analyst2pass', role: 'user' });
    expect(await screen.findByText('analyst2')).toBeInTheDocument();
  });

  it('validates the login and password before sending', async () => {
    let requests = 0;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
      http.post('*/api/v1/admin/users', () => {
        requests += 1;
        return problem(500, 'internal');
      }),
    );
    renderAt('/access/users');

    await userEvent.click(await screen.findByRole('button', { name: 'создать пользователя' }));
    const form = await screen.findByRole('dialog');
    await userEvent.type(within(form).getByLabelText('логин'), 'Bad Login');
    await userEvent.type(within(form).getByLabelText('пароль'), 'short');
    await userEvent.click(within(form).getByRole('button', { name: 'создать' }));

    expect(await within(form).findByText(/логин: от 3 до 64 знаков/)).toBeInTheDocument();
    expect(within(form).getByText('пароль должен быть не короче 8 знаков')).toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('reports a taken login in the form', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
      http.post('*/api/v1/admin/users', () => problem(409, 'conflict')),
    );
    renderAt('/access/users');

    await userEvent.click(await screen.findByRole('button', { name: 'создать пользователя' }));
    const form = await screen.findByRole('dialog');
    await userEvent.type(within(form).getByLabelText('логин'), 'analyst');
    await userEvent.type(within(form).getByLabelText('пароль'), 'analyst2pass');
    await userEvent.click(within(form).getByRole('button', { name: 'создать' }));

    expect(await within(form).findByText('этот логин уже занят')).toBeInTheDocument();
  });

  it('disables and enables a user', async () => {
    const list = people();
    const bodies: unknown[] = [];
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(list)),
      http.patch('*/api/v1/admin/users/:id', async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        bodies.push(body);
        list[1] = person({ enabled: body.enabled });
        return HttpResponse.json(list[1]);
      }),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    await userEvent.click(rowOf('analyst').getByRole('button', { name: 'отключить' }));

    expect(await screen.findByText('пользователь отключён')).toBeInTheDocument();
    await userEvent.click(await rowOf('analyst').findByRole('button', { name: 'включить' }));
    expect(await screen.findByText('пользователь включён')).toBeInTheDocument();
    expect(bodies).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('shows the last administrator error as a toast', async () => {
    const list = [
      ...people(),
      person({ id: 5, login: 'second-admin', displayName: 'второй', role: 'admin' }),
    ];
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(list)),
      http.patch('*/api/v1/admin/users/:id', () => problem(409, 'last_admin')),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    await userEvent.click(rowOf('second-admin').getByRole('button', { name: 'отключить' }));

    expect(
      await screen.findByText('нельзя отключить, понизить или удалить последнего администратора'),
    ).toBeInTheDocument();
  });

  it('sends only the changed fields when editing', async () => {
    let received: unknown;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
      http.patch('*/api/v1/admin/users/:id', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(person({ displayName: 'старший аналитик' }));
      }),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    await userEvent.click(rowOf('analyst').getByRole('button', { name: 'изменить' }));
    const form = await screen.findByRole('dialog', { name: 'изменить пользователя «analyst»' });
    const name = within(form).getByLabelText('имя');
    await userEvent.clear(name);
    await userEvent.type(name, 'старший аналитик');
    await userEvent.click(within(form).getByRole('button', { name: 'сохранить' }));

    expect(await screen.findByText('изменения сохранены')).toBeInTheDocument();
    expect(received).toEqual({ displayName: 'старший аналитик' });
  });

  it('reports a rejected edit as a toast and keeps the dialog open', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
      http.patch('*/api/v1/admin/users/:id', () => problem(409, 'last_admin')),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    await userEvent.click(rowOf('analyst').getByRole('button', { name: 'изменить' }));
    const form = await screen.findByRole('dialog');
    await userEvent.type(within(form).getByLabelText('новый пароль'), 'another-pass-1');
    await userEvent.click(within(form).getByRole('button', { name: 'сохранить' }));

    expect(
      (
        await screen.findAllByText(
          'нельзя отключить, понизить или удалить последнего администратора',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('hides password and role editing for a sso user', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    await userEvent.click(rowOf('m.orlova').getByRole('button', { name: 'изменить' }));
    const form = await screen.findByRole('dialog');

    expect(within(form).queryByLabelText('новый пароль')).not.toBeInTheDocument();
    expect(within(form).getByRole('combobox')).toBeDisabled();
  });

  it('deletes a user after confirmation', async () => {
    let deleted: string | undefined;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/admin/users', () => HttpResponse.json(people())),
      http.delete('*/api/v1/admin/users/:id', ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt('/access/users');

    await screen.findByRole('table', { name: 'пользователи' });
    await userEvent.click(rowOf('reports').getByRole('button', { name: 'удалить' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'удалить пользователя «reports»?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'удалить' }));

    expect(await screen.findByText('пользователь удалён')).toBeInTheDocument();
    expect(deleted).toBe('4');
  });
});
