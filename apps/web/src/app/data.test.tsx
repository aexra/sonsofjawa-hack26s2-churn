import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/setup';

import { admin, problem, renderAt, signedInAs } from './test-utils';

const result = (overrides: object = {}) => ({
  logId: 7,
  mode: 'upsert',
  entity: 'accounts',
  format: 'json',
  rowsReceived: 1,
  rowsApplied: 1,
  recalc: { accepted: true },
  ...overrides,
});

const idleStatus = {
  running: false,
  pendingAccounts: 0,
  lastRun: null,
  recentRuns: [],
};

const emptyLog = { page: 0, size: 10, totalItems: 0, totalPages: 0, items: [] };

const baseline = (log: object = emptyLog) => [
  ...signedInAs(admin),
  http.get('*/api/v1/source/ingest-log', () => HttpResponse.json(log)),
  http.get('*/api/v1/recalc/status', () => HttpResponse.json(idleStatus)),
];

const csvFile = (name: string, text: string) => new File([text], name, { type: 'text/csv' });

const fileInput = async (hint: RegExp): Promise<HTMLInputElement> => {
  const input = await screen.findByLabelText(hint);
  if (!(input instanceof HTMLInputElement)) throw new Error('file input not found');
  return input;
};

describe('data page: csv upload', () => {
  it('previews the file and sends it as text/csv', async () => {
    const user = userEvent.setup();
    let contentType: string | null = null;
    let body = '';
    server.use(
      ...baseline(),
      http.post('*/api/v1/source/accounts', async ({ request }) => {
        contentType = request.headers.get('content-type');
        body = await request.text();
        return HttpResponse.json(result({ format: 'csv', rowsReceived: 2, rowsApplied: 2 }));
      }),
    );
    renderAt('/data');

    const text = 'id,email,balance\n5,a@example.com,100\n6,b@example.com,200\n';
    await user.upload(await fileInput(/перетащите csv-файл/), csvFile('accounts.csv', text));

    expect(await screen.findByText('предпросмотр · первые 2 из 2 строк')).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: 'предпросмотр файла accounts.csv' });
    expect(within(preview).getByText('a@example.com')).toBeInTheDocument();
    expect(within(preview).getByText('balance')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'загрузить 2 строки' }));

    expect(await screen.findByText('загружено 2 строки — идёт пересчёт')).toBeInTheDocument();
    expect(contentType).toBe('text/csv');
    expect(body).toBe(text);
    expect(screen.getByLabelText(/перетащите csv-файл/)).toBeInTheDocument();
  });

  it('blocks the upload when the header misses a required column', async () => {
    const user = userEvent.setup();
    server.use(...baseline());
    renderAt('/data');

    await user.upload(
      await fileInput(/перетащите csv-файл/),
      csvFile('accounts.csv', 'id,balance\n5,100\n'),
    );

    expect(await screen.findByText('нет обязательных колонок: email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'загрузить 1 строку' })).toBeDisabled();
  });

  it('lists server errors and keeps the file when the upload is rejected', async () => {
    const user = userEvent.setup();
    server.use(
      ...baseline(),
      http.post('*/api/v1/source/accounts', () =>
        problem(422, 'validation_failed', {
          errors: [
            { row: 2, entity: 'accounts', field: 'email', code: 'required', message: 'required' },
          ],
        }),
      ),
    );
    renderAt('/data');

    await user.upload(
      await fileInput(/перетащите csv-файл/),
      csvFile('accounts.csv', 'email\na@example.com\n\n'),
    );
    await user.click(await screen.findByRole('button', { name: /^загрузить \d+ стро/ }));

    expect(
      await screen.findByText('сервер отклонил загрузку: 1 ошибка — ничего не записано'),
    ).toBeInTheDocument();
    expect(screen.getByText('обязательное поле')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^загрузить \d+ стро/ })).toBeEnabled();
  });

  it('explains oversized and unsupported uploads', async () => {
    const user = userEvent.setup();
    let status = 413;
    server.use(
      ...baseline(),
      http.post('*/api/v1/source/accounts', () =>
        problem(status, status === 413 ? 'payload_too_large' : 'unsupported_media_type'),
      ),
    );
    renderAt('/data');

    await user.upload(
      await fileInput(/перетащите csv-файл/),
      csvFile('accounts.csv', 'email\na@example.com\n'),
    );
    await user.click(await screen.findByRole('button', { name: 'загрузить 1 строку' }));
    expect(await screen.findByText('файл слишком большой (максимум 20 МБ)')).toBeInTheDocument();

    status = 415;
    await user.click(screen.getByRole('button', { name: 'загрузить 1 строку' }));
    expect(await screen.findByText('неподдерживаемый формат')).toBeInTheDocument();
  });
});

describe('data page: table editor', () => {
  it('validates cells and sends rows as a json array', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      ...baseline(),
      http.post('*/api/v1/source/accounts', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(result());
      }),
    );
    renderAt('/data');

    await user.click(await screen.findByRole('tab', { name: 'таблица' }));
    await user.click(screen.getByRole('button', { name: 'добавить строку' }));
    await user.click(screen.getByRole('button', { name: 'отправить 1 строку' }));

    const email = screen.getByRole('textbox', { name: 'email, строка 1' });
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('обязательное поле', { selector: 'span.sr-only' })).toBeInTheDocument();
    expect(body).toBeUndefined();

    await user.type(email, 'a@example.com');
    await user.type(screen.getByRole('textbox', { name: 'balance, строка 1' }), '12x');
    expect(screen.getByRole('textbox', { name: 'balance, строка 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await user.clear(screen.getByRole('textbox', { name: 'balance, строка 1' }));
    await user.type(screen.getByRole('textbox', { name: 'balance, строка 1' }), '1200');

    await user.click(screen.getByRole('button', { name: 'отправить 1 строку' }));

    expect(await screen.findByText('загружена 1 строка — идёт пересчёт')).toBeInTheDocument();
    expect(body).toEqual([{ email: 'a@example.com', balance: 1200 }]);
    expect(screen.queryByRole('textbox', { name: 'email, строка 1' })).not.toBeInTheDocument();
  });

  it('highlights the cells the server rejected', async () => {
    const user = userEvent.setup();
    server.use(
      ...baseline(),
      http.post('*/api/v1/source/accounts', () =>
        problem(422, 'validation_failed', {
          errors: [
            {
              row: 1,
              entity: 'accounts',
              field: 'email',
              code: 'invalid_format',
              message: 'bad email',
            },
          ],
        }),
      ),
    );
    renderAt('/data');

    await user.click(await screen.findByRole('tab', { name: 'таблица' }));
    await user.click(screen.getByRole('button', { name: 'добавить строку' }));
    await user.type(screen.getByRole('textbox', { name: 'email, строка 1' }), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'отправить 1 строку' }));

    expect(
      await screen.findByText('сервер отклонил загрузку: 1 ошибка — ничего не записано'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'email, строка 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );

    await user.type(screen.getByRole('textbox', { name: 'email, строка 1' }), 'x');
    expect(screen.getByRole('textbox', { name: 'email, строка 1' })).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('loads a service by id and edits it before sending', async () => {
    const user = userEvent.setup();
    let query: URLSearchParams | undefined;
    let body: unknown;
    server.use(
      ...baseline(),
      http.get('*/api/v1/source/services', ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({
          page: 0,
          size: 500,
          totalItems: 1,
          totalPages: 1,
          items: [
            {
              id: 26,
              name: 'hosting-26',
              ownerId: 6,
              paymentTerm: 'month',
              autoProlong: true,
              createdAt: '2026-01-10T10:00:00Z',
              expiresAt: '2026-11-10T10:00:00Z',
              status: 'active',
              price: 1500,
            },
          ],
        });
      }),
      http.post('*/api/v1/source/services', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(result({ entity: 'services' }));
      }),
    );
    renderAt('/data');

    await user.click(await screen.findByRole('button', { name: 'услуги' }));
    await user.click(await screen.findByRole('tab', { name: 'таблица' }));
    await user.type(screen.getByLabelText('загрузить из базы по ID'), '26, 27');
    await user.click(screen.getByRole('button', { name: 'загрузить' }));

    expect(await screen.findByRole('textbox', { name: 'name, строка 1' })).toHaveValue(
      'hosting-26',
    );
    expect(query?.get('ids')).toBe('26,27');
    expect(await screen.findByText('в базе нет записей с ID: 27')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'status, строка 1' }), [
      'prolong_wait',
    ]);
    await user.click(screen.getByRole('switch', { name: 'autoProlong, строка 1' }));
    await user.click(screen.getByRole('button', { name: 'отправить 1 строку' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual([
      {
        id: 26,
        name: 'hosting-26',
        ownerId: 6,
        paymentTerm: 'month',
        autoProlong: false,
        createdAt: '2026-01-10T10:00:00Z',
        expiresAt: '2026-11-10T10:00:00Z',
        status: 'prolong_wait',
        price: 1500,
      },
    ]);
  });

  it('rejects malformed ids without calling the server', async () => {
    const user = userEvent.setup();
    server.use(...baseline());
    renderAt('/data');

    await user.click(await screen.findByRole('tab', { name: 'таблица' }));
    await user.type(screen.getByLabelText('загрузить из базы по ID'), 'abc');
    await user.click(screen.getByRole('button', { name: 'загрузить' }));

    expect(
      await screen.findByText('укажите ID — целые числа через запятую, не больше 500'),
    ).toBeInTheDocument();
  });
});

describe('data page: full replacement', () => {
  it('asks for confirmation and replaces the snapshot from data.json', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      ...baseline(),
      http.get('*/api/v1/source/:entity', () =>
        HttpResponse.json({ page: 0, size: 1, totalItems: 40, totalPages: 40, items: [{}] }),
      ),
      http.put('*/api/v1/source/snapshot', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          result({ mode: 'snapshot', entity: 'snapshot', rowsReceived: 3, rowsApplied: 3 }),
        );
      }),
    );
    renderAt('/data');

    await user.click(await screen.findByRole('tab', { name: 'полная замена' }));
    expect(screen.getByRole('button', { name: 'заменить данные' })).toBeDisabled();

    const data = { accounts: [{ id: 1, email: 'a@example.com' }], services: [], transactions: [] };
    await user.upload(
      await fileInput(/перетащите data.json/),
      new File([JSON.stringify(data)], 'data.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(/клиенты 1 · услуги 0 · транзакции 0/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'заменить данные' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'заменить все данные?' });
    expect(body).toBeUndefined();
    expect(await within(dialog).findAllByText('40')).toHaveLength(3);

    await user.click(within(dialog).getByRole('button', { name: 'заменить данные' }));

    expect(await screen.findByText('загружено 3 строки — идёт пересчёт')).toBeInTheDocument();
    expect(body).toEqual(data);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not send anything when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      ...baseline(),
      http.get('*/api/v1/source/:entity', () =>
        HttpResponse.json({ page: 0, size: 1, totalItems: 0, totalPages: 0, items: [] }),
      ),
      http.put('*/api/v1/source/snapshot', () => {
        called = true;
        return HttpResponse.json(result());
      }),
    );
    renderAt('/data');

    await user.click(await screen.findByRole('tab', { name: 'полная замена' }));
    await user.upload(
      await fileInput(/перетащите data.json/),
      new File([JSON.stringify({ accounts: [], services: [], transactions: [] })], 'data.json', {
        type: 'application/json',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'заменить данные' }));
    await user.click(await screen.findByRole('button', { name: 'отмена' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(called).toBe(false);
  });
});

describe('data page: recalc and log', () => {
  it('requests a full recalculation', async () => {
    const user = userEvent.setup();
    let scope: string | null = null;
    server.use(
      ...baseline(),
      http.post('*/api/v1/recalc', ({ request }) => {
        scope = new URL(request.url).searchParams.get('scope');
        return HttpResponse.json({ accepted: true }, { status: 202 });
      }),
    );
    renderAt('/data');

    await user.click(await screen.findByRole('button', { name: 'пересчитать всех' }));

    expect(await screen.findByText('пересчёт запрошен')).toBeInTheDocument();
    expect(scope).toBe('all');
  });

  it('shows the queue and the last run', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/source/ingest-log', () => HttpResponse.json(emptyLog)),
      http.get('*/api/v1/recalc/status', () =>
        HttpResponse.json({
          running: false,
          pendingAccounts: 12,
          lastRun: {
            id: 3,
            trigger: 'ingest',
            startedAt: '2026-10-19T14:30:00Z',
            finishedAt: '2026-10-19T14:30:05Z',
            accountsProcessed: 40,
            status: 'ok',
          },
          recentRuns: [],
        }),
      ),
    );
    renderAt('/data');

    expect(await screen.findByText('в очереди 12 клиентов')).toBeInTheDocument();
    expect(screen.getByText('загрузка данных')).toBeInTheDocument();
  });

  it('shows the log and expands the errors of a rejected upload', async () => {
    const user = userEvent.setup();
    server.use(
      ...baseline({
        page: 0,
        size: 10,
        totalItems: 2,
        totalPages: 1,
        items: [
          {
            id: 2,
            receivedAt: '2026-10-19T14:30:00Z',
            actor: 'billing',
            channel: 'api',
            mode: 'upsert',
            entity: 'services',
            format: 'json',
            rowsReceived: 10,
            rowsApplied: 0,
            status: 'rejected',
            errors: [
              {
                row: 3,
                entity: 'services',
                field: 'status',
                code: 'invalid_value',
                message: 'bad',
              },
            ],
          },
          {
            id: 1,
            receivedAt: '2026-10-19T14:00:00Z',
            actor: 'admin',
            channel: 'web',
            mode: 'upsert',
            entity: 'accounts',
            format: 'csv',
            rowsReceived: 5,
            rowsApplied: 5,
            status: 'ok',
            errors: [],
          },
        ],
      }),
    );
    renderAt('/data');

    const table = await screen.findByRole('table', { name: 'журнал загрузок' });
    expect(within(table).getByText('billing')).toBeInTheDocument();
    expect(within(table).getByText('10 / 0')).toBeInTheDocument();
    expect(within(table).getByText('успех')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'отклонено · 1 ошибка' }));

    expect(within(table).getByText('значение вне списка допустимых')).toBeInTheDocument();
  });

  it('shows an empty state when nothing was uploaded yet', async () => {
    server.use(...baseline());
    renderAt('/data');

    expect(await screen.findByText('загрузок пока не было')).toBeInTheDocument();
  });
});
