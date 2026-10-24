import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/setup';

import { admin, problem, renderAt, signedInAs } from './test-utils';

const reason = (key: string, title: string, text: string, contribution: number) => ({
  key,
  title,
  text,
  value: 1,
  weight: contribution,
  contribution,
  params: {},
});

const service = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `service-00${String(id).padStart(2, '0')}`,
  ownerId: 5,
  paymentTerm: 'month',
  autoProlong: true,
  createdAt: '2025-01-01T00:00:00Z',
  expiresAt: '2025-10-14T15:00:00Z',
  status: 'prolong_wait',
  price: 297,
  isLive: true,
  daysLeft: -370,
  revenueHorizon: 293,
  atRisk: true,
  ...overrides,
});

const transaction = (id: number, status: string) => ({
  id,
  amount: 216,
  status,
  performedAt: null,
  createdAt: '2025-09-14T15:00:00Z',
  type: id === 5 ? 'order' : 'prolong',
  serviceId: 5,
});

const scored = {
  account: {
    id: 5,
    email: 'user-0005@example.test',
    balance: 28657,
    withdrawBalance: 7623,
    totalReplenished: 293608,
    bonusBalance: 9863,
    bonusState: 'locked',
  },
  score: {
    status: 'scored',
    noScoreReason: null,
    riskScore: 77.96,
    riskLevel: 'high',
    loyalty: 22.04,
    probability: 0.7796,
    revenueHorizon: 469136,
    securedAmount: 0,
    uncoveredAmount: 469136,
    expectedLoss: 365738,
    horizonDays: 30,
    servicesTotal: 3,
    servicesLive: 3,
    servicesAtRisk: 3,
    nextExpiryAt: null,
    calculatedAt: '2026-10-19T15:04:00Z',
    asOf: '2026-10-19T15:00:00Z',
    validUntil: '2026-10-19T16:00:00Z',
    modelVersion: 2,
    reasons: [
      reason(
        'prolong_wait',
        'услуги в ожидании оплаты',
        '3 из 3 действующих услуг ожидают оплаты',
        30,
      ),
      reason(
        'renewal_unsecured',
        'продление не обеспечено',
        'услуга service-0005 не продлится автоматически',
        25,
      ),
      reason('insufficient_funds', 'нехватка средств', 'средств хватает на 6% продлений', 20.66),
    ],
    features: [
      {
        key: 'prolong_wait',
        title: 'услуги в ожидании оплаты',
        value: 1,
        weight: 30,
        contribution: 30,
      },
      {
        key: 'suspended_share',
        title: 'выключенные услуги',
        value: 0,
        weight: 10,
        contribution: 0,
      },
    ],
    anomalies: ['overdue_prolong_wait'],
  },
  services: [
    service(5),
    service(15, { status: 'blocked', isLive: false, daysLeft: 20, atRisk: false }),
  ],
  transactions: {
    items: [transaction(5, 'performed'), transaction(15, 'not_performed')],
    total: 10,
    notPerformed: 3,
  },
};

const unscored = {
  account: { ...scored.account, id: 2, email: 'user-0002@example.test', bonusState: 'unlocked' },
  score: {
    status: 'no_score',
    noScoreReason: 'no_live_services',
    riskScore: null,
    riskLevel: null,
    horizonDays: 30,
    reasons: [],
    features: [],
    anomalies: [],
  },
  services: [service(2, { status: 'blocked', isLive: false, daysLeft: 20, atRisk: false })],
  transactions: { items: [transaction(2, 'performed')], total: 1, notPerformed: 0 },
};

const settings = {
  modelVersion: 2,
  clock: { mode: 'real', asOf: '2026-10-19T15:00:00Z' },
  features: [],
  groups: [
    {
      key: 'levels',
      settings: [
        { key: 'level_high', value: 50 },
        { key: 'level_medium', value: 25 },
      ],
    },
    { key: 'horizon', settings: [{ key: 'grace_days', value: 5 }] },
  ],
};

const point = (minute: number, version: number, score: number) => ({
  calculatedAt: `2026-10-19T15:0${String(minute)}:00Z`,
  asOf: '2026-10-19T15:00:00Z',
  status: 'scored',
  riskScore: score,
  riskLevel: 'high',
  expectedLoss: 365738,
  modelVersion: version,
});

const api = (details: JsonBodyType, history: JsonBodyType[] = []) => [
  ...signedInAs(admin),
  http.get('*/api/v1/model/settings', () => HttpResponse.json(settings)),
  http.get('*/api/v1/customers/:id/history', () => HttpResponse.json(history)),
  http.get('*/api/v1/customers/:id', () => HttpResponse.json(details)),
];

describe('customer card', () => {
  it('shows all blocks for a scored customer', async () => {
    server.use(...api(scored, [point(0, 1, 77.96), point(4, 2, 77.96)]));
    renderAt('/customers/5');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'клиент 5 user-0005@example.test',
      );
    });
    expect(await screen.findByText('3 657,38 €')).toBeInTheDocument();
    expect(screen.getAllByText('4 691,36 €', { selector: 'dd' })).toHaveLength(2);
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByText('22,04')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'оценка риска' })).getByText('высокий'),
    ).toBeInTheDocument();
    expect(screen.getByText(/ожидаемые потери за 30 дн. — выручка/)).toBeInTheDocument();
    expect(await screen.findByText(/высокий — от 50, средний — от 25/)).toBeInTheDocument();

    const reasons = within(screen.getByRole('region', { name: 'почему такая оценка' }));
    expect(reasons.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^услуги в ожидании оплаты.*\+30,00$/),
      expect.stringMatching(/^продление не обеспечено.*\+25,00$/),
      expect.stringMatching(/^нехватка средств.*\+20,66$/),
    ]);
    await userEvent.click(reasons.getByText('все признаки'));
    expect(reasons.getByRole('table', { name: 'все признаки модели' })).toBeInTheDocument();
    expect(reasons.getByText('выключенные услуги')).toBeInTheDocument();

    expect(
      screen.getByText('заблокированные бонусы не считаются средствами на продления.'),
    ).toBeInTheDocument();
    expect(screen.getByText('бонусы · заблокированы')).toBeInTheDocument();
    expect(screen.getByText('286,57 €')).toBeInTheDocument();
    expect(screen.getByText('76,23 €')).toBeInTheDocument();

    const services = screen.getByRole('table', { name: 'услуги клиента 5' });
    expect(within(services).getByText('ожидает оплаты')).toBeInTheDocument();
    expect(within(services).getByText('заблокирована')).toBeInTheDocument();
    expect(within(services).getByText('под риском')).toBeInTheDocument();
    expect(within(services).getByText('удаление по правилам')).toBeInTheDocument();
    expect(within(services).getAllByText('месяц')).toHaveLength(2);

    expect(screen.getByText(/^3 из 10 не выполнены/)).toBeInTheDocument();
    const transactions = screen.getByRole('table', { name: 'транзакции клиента 5' });
    expect(within(transactions).getByText('не выполнена')).toBeInTheDocument();
    expect(within(transactions).getByText('заказ')).toBeInTheDocument();
    expect(within(transactions).getByText('продление')).toBeInTheDocument();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('аномалия в данных: услуги ждут оплаты дольше срока удаления');
    expect(alert).toHaveTextContent('service-0005 в статусе «ожидает оплаты» больше 5 дн.');
    expect(alert).toHaveTextContent('оценка считается как обычно, проверьте данные биллинга.');
  });

  it('shows a no score state with the other blocks', async () => {
    server.use(...api(unscored, [point(0, 1, 0)]));
    renderAt('/customers/2');

    expect(await screen.findByText('нет оценки')).toBeInTheDocument();
    expect(
      screen.getByText(/у клиента нет действующих услуг — все услуги удалены или заблокированы/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'почему такая оценка' })).not.toBeInTheDocument();
    expect(screen.queryByText('ожидаемые потери за 30 дн.')).not.toBeInTheDocument();
    expect(screen.getByText('бонусы · можно тратить')).toBeInTheDocument();
    expect(screen.queryByText(/заблокированные бонусы/)).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'услуги клиента 2' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'транзакции клиента 2' })).toBeInTheDocument();
    expect(await screen.findByText('версия модели 1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains a customer without services', async () => {
    server.use(
      ...api({
        ...unscored,
        score: { ...unscored.score, noScoreReason: 'no_services' },
        services: [],
        transactions: { items: [], total: 0, notPerformed: 0 },
      }),
    );
    renderAt('/customers/2');

    expect(await screen.findByText(/у клиента нет услуг\./)).toBeInTheDocument();
    expect(screen.getByText('транзакций нет')).toBeInTheDocument();
  });

  it('shows a pending score', async () => {
    server.use(
      ...api({
        ...scored,
        score: { ...scored.score, status: 'pending', anomalies: [], reasons: [] },
      }),
    );
    renderAt('/customers/5');

    expect(await screen.findByText('оценка рассчитывается')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'почему такая оценка' })).not.toBeInTheDocument();
  });

  it('shows not found and returns to the list with filters', async () => {
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/model/settings', () => HttpResponse.json(settings)),
      http.get('*/api/v1/customers/:id', () => problem(404, 'not_found')),
    );
    const router = renderAt('/customers/999');

    expect(await screen.findByText('клиент не найден')).toBeInTheDocument();
    expect(screen.getByText(/клиента 999 нет в данных/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'к списку клиентов' }));
    expect(router.state.location.pathname).toBe('/customers');
  });

  it('shows an error with retry', async () => {
    let calls = 0;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/model/settings', () => HttpResponse.json(settings)),
      http.get('*/api/v1/customers/:id/history', () => HttpResponse.json([])),
      http.get('*/api/v1/customers/:id', () => {
        calls += 1;
        return calls === 1 ? problem(500, 'internal') : HttpResponse.json(scored);
      }),
    );
    renderAt('/customers/5');

    expect(await screen.findByText('не удалось загрузить данные')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'повторить' }));
    expect(await screen.findByText('3 657,38 €')).toBeInTheDocument();
  });

  it('keeps list filters in the back link', async () => {
    server.use(
      ...api(scored),
      http.get('*/api/v1/customers', () =>
        HttpResponse.json({
          items: [
            { id: 5, email: 'user-0005@example.test', scoreStatus: 'scored', noScoreReason: null },
          ],
          fields: ['id', 'email'],
          sort: [],
          page: 0,
          size: 25,
          totalItems: 1,
          totalPages: 1,
        }),
      ),
    );
    const router = renderAt('/customers?level=high&q=user');

    await userEvent.click(await screen.findByRole('link', { name: 'клиент 5' }));
    expect(router.state.location.pathname).toBe('/customers/5');
    await userEvent.click(await screen.findByRole('link', { name: /к списку клиентов/ }));
    expect(router.state.location.pathname).toBe('/customers');
    expect(router.state.location.search).toBe('?level=high&q=user');
  });
});

describe('score history', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 560, 240),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists recalculations while there are fewer than three', async () => {
    server.use(...api(scored, [point(0, 1, 70), point(4, 2, 77.96)]));
    renderAt('/customers/5');

    const history = await screen.findByRole('region', { name: 'история оценки' });
    expect(await within(history).findByText('версия модели 2')).toBeInTheDocument();
    expect(within(history).getByText('версия модели 1')).toBeInTheDocument();
    expect(within(history).queryByRole('tab')).not.toBeInTheDocument();
  });

  it('draws points after a model change and switches the period', async () => {
    const history = [
      { ...point(0, 1, 70), calculatedAt: '2026-09-01T10:00:00Z' },
      point(0, 1, 75),
      point(2, 2, 77.96),
      point(4, 2, 78),
    ];
    server.use(...api(scored, history));
    renderAt('/customers/5');

    const region = await screen.findByRole('region', { name: 'история оценки' });
    expect(await within(region).findByRole('tab', { name: '30 дн.' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(region).getByText('пересчётов за период: 3')).toBeInTheDocument();
    await waitFor(() => {
      expect(region.querySelectorAll('.recharts-line-dot')).toHaveLength(6);
    });
    expect(within(region).getByText('версия 2')).toBeInTheDocument();

    await userEvent.click(within(region).getByRole('tab', { name: 'всё' }));
    expect(within(region).getByText('пересчётов за период: 4')).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('tab', { name: '7 дн.' }));
    expect(within(region).getByText('пересчётов за период: 3')).toBeInTheDocument();
  });
});
