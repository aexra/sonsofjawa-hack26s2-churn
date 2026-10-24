import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/test/setup';

import { admin, problem, renderAt, signedInAs } from './test-utils';

const DEFAULT_FIELDS =
  'id,email,balance,totalReplenished,riskScore,riskLevel,topReason,expectedLoss';

const reason = {
  key: 'prolong_wait',
  title: 'услуги в ожидании оплаты',
  text: '3 из 3 действующих услуг ожидают оплаты',
  value: 1,
  weight: 30,
  contribution: 30,
  params: {},
};

const customers: Record<string, unknown>[] = [
  {
    id: 5,
    email: 'user-0005@example.test',
    balance: 28657,
    totalReplenished: 293608,
    scoreStatus: 'scored',
    noScoreReason: null,
    riskScore: 77.96,
    riskLevel: 'high',
    expectedLoss: 365738,
    topReason: reason,
  },
  {
    id: 2,
    email: 'user-0002@example.test',
    balance: 32098,
    totalReplenished: 105256,
    scoreStatus: 'no_score',
    noScoreReason: 'no_live_services',
    riskScore: null,
    riskLevel: null,
    expectedLoss: null,
    topReason: null,
  },
  {
    id: 11,
    email: 'user-0011@example.test',
    balance: 100,
    totalReplenished: 200,
    scoreStatus: 'pending',
    noScoreReason: null,
    riskScore: null,
    riskLevel: null,
    expectedLoss: null,
    topReason: null,
  },
];

const pageFor = (search: URLSearchParams, total = customers.length) => {
  const fields = (search.get('fields') ?? DEFAULT_FIELDS).split(',');
  const size = Number(search.get('size') ?? 25);
  return HttpResponse.json({
    items: customers.map((customer) =>
      Object.fromEntries(fields.map((field) => [field, customer[field]])),
    ),
    fields,
    sort: [],
    page: Number(search.get('page') ?? 0),
    size,
    totalItems: total,
    totalPages: Math.ceil(total / size),
  });
};

const listing = (requests: URLSearchParams[], total = customers.length) =>
  http.get('*/api/v1/customers', ({ request }) => {
    const search = new URL(request.url).searchParams;
    requests.push(search);
    return pageFor(search, total);
  });

const last = (requests: URLSearchParams[]) => requests[requests.length - 1];

const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);

beforeEach(() => {
  window.localStorage.clear();
});

describe('customers table', () => {
  it('renders default columns and rows without a score', async () => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests));
    renderAt('/customers');

    const table = await screen.findByRole('table', { name: 'клиенты под риском' });
    expect(headers()).toEqual([
      'ID',
      'email',
      'баланс',
      'пополнено всего',
      'risk-score',
      'главная причина',
      'ожидаемые потери',
    ]);
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('77,96')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('высокий')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('3 657,38 €')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('286,57 €')).toBeInTheDocument();

    expect(within(rows[2]!).getByText('нет оценки')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('нет действующих услуг')).toBeInTheDocument();
    expect(within(rows[2]!).getAllByText('—')).toHaveLength(2);

    expect(within(rows[3]!).getByText('расчёт…')).toBeInTheDocument();
    expect(screen.getByText(/показано/)).toHaveTextContent('показано 1–3 из 3');
    expect(last(requests)?.get('fields')).toBe(`${DEFAULT_FIELDS},scoreStatus,noScoreReason`);
  });

  it('shows the full reason in a tooltip', async () => {
    server.use(...signedInAs(admin), listing([]));
    renderAt('/customers');

    await userEvent.hover(await screen.findByText(reason.text));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('услуги в ожидании оплаты');
    expect(tooltip).toHaveTextContent('вклад +30,00');
  });

  it.each([
    ['ID', 'id'],
    ['email', 'email'],
    ['баланс', 'balance'],
    ['пополнено всего', 'totalReplenished'],
    ['risk-score', 'riskScore'],
    ['ожидаемые потери', 'expectedLoss'],
  ])('cycles sorting by %s through both directions and back to default', async (label, field) => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests));
    const router = renderAt('/customers');
    await screen.findByRole('table');
    const header = () => screen.getByRole('button', { name: label });

    await userEvent.click(header());
    await waitFor(() => {
      expect(last(requests)?.get('sort')).toBe(`${field},asc`);
    });
    expect(screen.getByRole('columnheader', { name: label })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    await userEvent.click(header());
    await waitFor(() => {
      expect(last(requests)?.get('sort')).toBe(`${field},desc`);
    });
    expect(screen.getByRole('columnheader', { name: label })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await userEvent.click(header());
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
    expect(screen.getByRole('columnheader', { name: label })).toHaveAttribute('aria-sort', 'none');
  });

  it('opens a customer on row click and keeps real links for new tabs', async () => {
    server.use(...signedInAs(admin), listing([]));
    const router = renderAt('/customers');

    const link = await screen.findByRole('link', { name: 'клиент 5' });
    expect(link).toHaveAttribute('href', '/customers/5');

    await userEvent.click(screen.getByText('user-0005@example.test'));
    expect(router.state.location.pathname).toBe('/customers/5');
  });

  it('keeps pagination in the url', async () => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests, 60));
    const router = renderAt('/customers');

    await userEvent.click(await screen.findByRole('button', { name: 'вперёд' }));
    await waitFor(() => {
      expect(last(requests)?.get('page')).toBe('1');
    });
    expect(router.state.location.search).toBe('?page=2');
    expect(screen.getByRole('button', { name: 'назад' })).toBeEnabled();
  });

  it('reads filters, sorting and paging from the url', async () => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests, 300));
    renderAt('/customers?level=high,medium&q=user&sort=balance,desc&page=2&size=50&minScore=40');

    await screen.findByRole('table');
    const request = last(requests);
    expect(request?.get('level')).toBe('high,medium');
    expect(request?.get('q')).toBe('user');
    expect(request?.get('sort')).toBe('balance,desc');
    expect(request?.get('page')).toBe('1');
    expect(request?.get('size')).toBe('50');
    expect(request?.get('minScore')).toBe('40');
    expect(screen.getByRole('button', { name: 'высокий' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'низкий' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('searchbox')).toHaveValue('user');
  });
});

describe('customers filter', () => {
  it('writes search, levels, anomalies and score range to the url', async () => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests));
    const router = renderAt('/customers');
    await screen.findByRole('table');
    const search = () => new URLSearchParams(router.state.location.search);

    await userEvent.type(screen.getByRole('searchbox'), 'user-0005');
    expect(search().has('q')).toBe(false);
    await waitFor(() => {
      expect(search().get('q')).toBe('user-0005');
    });
    await waitFor(() => {
      expect(last(requests)?.get('q')).toBe('user-0005');
    });

    await userEvent.click(screen.getByRole('button', { name: 'высокий' }));
    await userEvent.click(screen.getByRole('button', { name: 'средний' }));
    expect(search().get('level')).toBe('high,medium');

    await userEvent.click(screen.getByRole('switch', { name: 'только с аномалиями' }));
    expect(search().get('hasAnomalies')).toBe('true');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'risk-score от' }), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'до' }), { target: { value: '90' } });
    await waitFor(() => {
      expect(search().get('minScore')).toBe('40');
      expect(search().get('maxScore')).toBe('90');
    });
    await waitFor(() => {
      const request = last(requests);
      expect(request?.get('level')).toBe('high,medium');
      expect(request?.get('hasAnomalies')).toBe('true');
      expect(request?.get('minScore')).toBe('40');
      expect(request?.get('maxScore')).toBe('90');
    });
  });

  it('switches between levels and the no-score chip and resets everything', async () => {
    server.use(...signedInAs(admin), listing([]));
    const router = renderAt('/customers?level=low&q=abc');
    await screen.findByRole('table');
    const search = () => new URLSearchParams(router.state.location.search);

    await userEvent.click(screen.getByRole('button', { name: 'нет оценки' }));
    expect(search().get('status')).toBe('no_score');
    expect(search().has('level')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'сбросить фильтры' }));
    expect(router.state.location.search).toBe('');
    await waitFor(() => {
      expect(screen.getByRole('searchbox')).toHaveValue('');
    });
    expect(screen.getByRole('button', { name: 'сбросить фильтры' })).toBeDisabled();
  });

  it('shows the filtered empty state and clears filters from it', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/customers', ({ request }) => {
        const filtered = new URL(request.url).searchParams.has('q');
        return HttpResponse.json({
          items: [],
          fields: [],
          sort: [],
          page: 0,
          size: 25,
          totalItems: filtered ? 0 : 0,
          totalPages: 0,
        });
      }),
    );
    const router = renderAt('/customers?q=nobody');

    expect(await screen.findByText('никого не нашли, измените фильтры')).toBeInTheDocument();
    const empty = screen.getByText('никого не нашли, измените фильтры').closest('div')!;
    await userEvent.click(within(empty).getByRole('button', { name: 'сбросить фильтры' }));
    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('данных пока нет')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    let attempts = 0;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/customers', () => {
        attempts += 1;
        if (attempts === 1) return problem(500, 'internal');
        return HttpResponse.json({
          items: [{ id: 1, email: 'user-0001@example.test', scoreStatus: 'no_score' }],
          fields: ['id', 'email'],
          sort: [],
          page: 0,
          size: 25,
          totalItems: 1,
          totalPages: 1,
        });
      }),
    );
    renderAt('/customers');

    await userEvent.click(await screen.findByRole('button', { name: 'повторить' }));
    expect(await screen.findByText('user-0001@example.test')).toBeInTheDocument();
  });
});

describe('customers columns', () => {
  const openColumns = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'колонки' }));
    return screen.findByRole('dialog', { name: 'колонки таблицы' });
  };

  it('adds a column, reorders columns and remembers the choice', async () => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests));
    renderAt('/customers');
    const dialog = await openColumns();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'услуг под риском' }));
    await waitFor(() => {
      expect(last(requests)?.get('fields')).toBe(
        `${DEFAULT_FIELDS},servicesAtRisk,scoreStatus,noScoreReason`,
      );
    });

    await userEvent.click(within(dialog).getByRole('button', { name: 'опустить колонку «ID»' }));
    await waitFor(() => {
      expect(last(requests)?.get('fields')?.startsWith('email,id,balance')).toBe(true);
    });
    expect(headers().slice(0, 3)).toEqual(['email', 'ID', 'баланс']);

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'баланс' }));
    await waitFor(() => {
      expect(last(requests)?.get('fields')?.startsWith('email,id,totalReplenished')).toBe(true);
    });
    expect(headers()).not.toContain('баланс');

    expect(JSON.parse(window.localStorage.getItem('customers.columns') ?? '[]')).toEqual([
      'email',
      'id',
      'totalReplenished',
      'riskScore',
      'riskLevel',
      'topReason',
      'expectedLoss',
      'servicesAtRisk',
    ]);
  });

  it('reorders columns by dragging', async () => {
    const requests: URLSearchParams[] = [];
    server.use(...signedInAs(admin), listing(requests));
    renderAt('/customers');
    const dialog = await openColumns();

    const items = within(dialog).getAllByRole('listitem');
    fireEvent.dragStart(items[0]!, {
      dataTransfer: { effectAllowed: 'none', setData: () => undefined },
    });
    fireEvent.dragOver(items[2]!);
    fireEvent.drop(items[2]!);
    await waitFor(() => {
      expect(last(requests)?.get('fields')?.startsWith('email,balance,id,totalReplenished')).toBe(
        true,
      );
    });
  });

  it('restores the saved columns after a reload', async () => {
    const requests: URLSearchParams[] = [];
    window.localStorage.setItem(
      'customers.columns',
      JSON.stringify(['email', 'servicesLive', 'id']),
    );
    server.use(...signedInAs(admin), listing(requests));
    renderAt('/customers');

    await screen.findByRole('table');
    expect(headers()).toEqual(['email', 'услуг действующих', 'ID']);
    expect(last(requests)?.get('fields')).toBe('email,servicesLive,id,scoreStatus,noScoreReason');
  });

  it('resets stale columns and tells about it when the server rejects a field', async () => {
    const requests: URLSearchParams[] = [];
    window.localStorage.setItem('customers.columns', JSON.stringify(['id', 'retiredField']));
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/customers', ({ request }) => {
        const search = new URL(request.url).searchParams;
        if (search.get('fields')?.includes('retiredField')) return problem(400, 'invalid_field');
        requests.push(search);
        return pageFor(search);
      }),
    );
    renderAt('/customers');

    expect(await screen.findByText('набор колонок сброшен')).toBeInTheDocument();
    await screen.findByRole('table');
    expect(headers()).toHaveLength(7);
    expect(window.localStorage.getItem('customers.columns')).toBeNull();
  });
});

describe('customers export', () => {
  it('links to the csv export with the current filters, sorting and columns', async () => {
    server.use(...signedInAs(admin), listing([]));
    renderAt('/customers?level=high&sort=balance,asc&page=2&size=50');

    const link = await screen.findByRole('link', { name: 'скачать csv' });
    const url = new URL(link.getAttribute('href') ?? '');
    expect(url.pathname).toBe('/api/v1/customers/export');
    expect(url.searchParams.get('fields')).toBe(DEFAULT_FIELDS);
    expect(url.searchParams.get('level')).toBe('high');
    expect(url.searchParams.get('sort')).toBe('balance,asc');
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('size')).toBe(false);
  });
});
