import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/setup';

import { admin, analyst, problem, renderAt, signedInAs, stubChartSize } from './test-utils';

const plain = (value: string | null) => (value ?? '').replaceAll(new RegExp('[  ]', 'g'), ' ');

const summary = (overrides: object = {}) => ({
  asOf: '2026-10-19T15:00:00',
  calculatedAt: '2026-10-19T15:04:00',
  modelVersion: 2,
  horizonDays: 30,
  currency: 'EUR',
  accounts: { total: 10, scored: 6, high: 3, medium: 0, low: 3, noScore: 4, pending: 0 },
  money: {
    expectedLoss: 681905,
    revenueHorizon: 1500000,
    revenueAtRisk: 1086650,
    securedAmount: 300000,
  },
  avgRiskScore: 44.7,
  servicesAtRisk: 11,
  scoreHistogram: Array.from({ length: 10 }, (_, index) => ({
    from: index * 10,
    to: (index + 1) * 10,
    count: [0, 1, 1, 0, 1, 1, 0, 1, 1, 0][index] ?? 0,
  })),
  topReasons: [
    {
      key: 'renewal_unsecured',
      title: 'продление не обеспечено',
      customers: 4,
      contributionSum: 80,
    },
    { key: 'prolong_wait', title: 'услуги в ожидании оплаты', customers: 2, contributionSum: 50 },
  ],
  lastRecalc: {
    id: 7,
    trigger: 'model',
    startedAt: '2026-10-19T15:03:00',
    finishedAt: '2026-10-19T15:04:00',
    asOf: '2026-10-19T15:00:00',
    modelVersion: 2,
    accountsProcessed: 10,
    status: 'ok',
    error: null,
  },
  ...overrides,
});

const isoDay = (offset: number) =>
  new Date(Date.UTC(2026, 9, 19 + offset)).toISOString().slice(0, 10);

const chart = () => ({
  asOf: '2026-10-19T15:00:00',
  horizonDays: 30,
  points: Array.from({ length: 121 }, (_, index) => {
    const offset = index - 90;
    const date = isoDay(offset);
    if (offset < 0) {
      return {
        date,
        kind: 'fact',
        deletions: null,
        deletionsEstimated: offset === -30 ? 1 : 0,
        overdueNonRenewals: offset === -10 ? 1.2 : 0,
        overdueLossAmount: offset === -10 ? 4200 : 0,
        servicesAtRisk: null,
      };
    }
    if (offset === 0) {
      return {
        date,
        kind: 'today',
        expectedNonRenewals: 5.4,
        overdueNonRenewals: 0.8,
        overdueLossAmount: 2100,
        servicesAtRisk: 11,
      };
    }
    return {
      date,
      kind: 'forecast',
      expectedNonRenewals: offset === 7 ? 0.23 : offset === 14 ? 0.25 : 0,
      expectedLossAmount: offset === 7 ? 18565 : null,
      servicesAtRisk: offset <= 7 ? 2 : 0,
    };
  }),
});

const settings = (mode = 'frozen') => ({
  modelVersion: 2,
  clock: { mode, asOf: '2026-10-19T15:00:00' },
  groups: [
    {
      key: 'horizon',
      settings: [
        {
          key: 'grace_days',
          value: 5,
          defaultValue: 5,
          min: 0,
          max: 30,
          unit: 'days',
          title: 'grace',
          description: 'grace',
        },
      ],
    },
  ],
  features: [],
});

const topRow = (id: number, level: string, score: number, loss: number, reason: string) => ({
  id,
  email: `user-${String(id).padStart(4, '0')}@example.test`,
  riskScore: score,
  riskLevel: level,
  expectedLoss: loss,
  topReason: {
    key: 'r',
    title: 'r',
    text: reason,
    value: 1,
    weight: 1,
    contribution: 1,
    params: {},
  },
});

const topPage = (items: object[]) => ({
  page: 0,
  size: 10,
  totalItems: items.length,
  totalPages: 1,
  items,
  fields: [],
  sort: [],
});

const defaultTop = () =>
  topPage([
    topRow(5, 'high', 77.96, 365738, '3 из 3 действующих услуг ожидают оплаты'),
    topRow(9, 'high', 57.55, 334030, 'услуга service-0009 не продлится автоматически: срок истёк'),
    topRow(1, 'medium', 27, 18565, 'услуга service-0001 не продлится автоматически'),
  ]);

const overviewHandlers = (
  options: { summary?: object; chart?: object; top?: object; mode?: string } = {},
) => [
  http.get('*/api/v1/analytics/summary', () => HttpResponse.json(options.summary ?? summary())),
  http.get('*/api/v1/analytics/churn-chart', () => HttpResponse.json(options.chart ?? chart())),
  http.get('*/api/v1/customers', () => HttpResponse.json(options.top ?? defaultTop())),
  http.get('*/api/v1/model/settings', () => HttpResponse.json(settings(options.mode))),
];

describe('overview page', () => {
  beforeEach(() => {
    stubChartSize(1100, 260);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the money and risk summary in the contract formats', async () => {
    server.use(...signedInAs(admin), ...overviewHandlers());
    renderAt('/');

    const kpi = await screen.findByRole('region', { name: 'сводка на горизонте 30 дн.' });
    expect(within(kpi).getByText('ожидаемые потери за 30 дн.')).toBeInTheDocument();
    expect(plain(within(kpi).getByText('6 819,05').textContent)).toBe('6 819,05€');
    expect(within(kpi).getByText('по 6 оценённым клиентам')).toBeInTheDocument();
    expect(within(kpi).getByText('из 6')).toBeInTheDocument();
    expect(within(kpi).getByText('50% оценённых · открыть список')).toBeInTheDocument();
    expect(within(kpi).getByText('10 866,50')).toBeInTheDocument();
    expect(within(kpi).getByText('за 30 дн., без учёта вероятности')).toBeInTheDocument();
    expect(within(kpi).getByText('44,70')).toBeInTheDocument();
    expect(within(kpi).getByText('4 клиента без оценки')).toBeInTheDocument();
  });

  it('opens the filtered customer list from the high risk card', async () => {
    server.use(...signedInAs(admin), ...overviewHandlers());
    const router = renderAt('/');

    await userEvent.click(await screen.findByRole('button', { name: /клиентов с высоким риском/ }));

    expect(router.state.location.pathname).toBe('/customers');
    expect(router.state.location.search).toBe('?level=high');
  });

  it('explains how the loss is calculated in a dialog', async () => {
    server.use(...signedInAs(admin), ...overviewHandlers());
    renderAt('/');

    await userEvent.click(
      await screen.findByRole('button', { name: 'как считаются ожидаемые потери' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'как считаются ожидаемые потери' });
    expect(within(dialog).getByText(/умноженная на оценку вероятности ухода/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'потери = risk-score / 100 × (выручка за 30 дн. − обеспечено балансом)',
      ),
    ).toBeInTheDocument();
  });

  it('shows the model moment and the clock mode in the header', async () => {
    server.use(...signedInAs(admin), ...overviewHandlers({ mode: 'frozen' }));
    renderAt('/');

    expect(await screen.findByText('19.10.2026 15:00')).toBeInTheDocument();
    expect(screen.getByText(/момент расчёта:/)).toHaveTextContent(
      'момент расчёта: 19.10.2026 15:00 · зафиксированное время',
    );
  });

  it('shows the distribution, the main reasons and the last recalculation', async () => {
    server.use(...signedInAs(admin), ...overviewHandlers());
    renderAt('/');

    const distribution = await screen.findByRole('region', {
      name: 'распределение по уровням риска',
    });
    expect(
      await within(distribution).findByRole('img', {
        name: 'клиенты по уровням риска: высокий 3, средний 0, низкий 3, нет оценки 4',
      }),
    ).toBeInTheDocument();
    const legend = within(distribution)
      .getAllByRole('listitem')
      .slice(0, 4)
      .map((item) => item.textContent);
    expect(legend).toEqual(['высокий3', 'средний0', 'низкий3', 'нет оценки4']);
    expect(within(distribution).getByLabelText('10–20: 1')).toBeInTheDocument();
    expect(
      within(distribution).getByText(/у 4 клиентов нет действующих услуг/),
    ).toBeInTheDocument();

    const reasons = await screen.findByRole('region', { name: 'чаще всего главная причина' });
    expect(await within(reasons).findByText('продление не обеспечено')).toBeInTheDocument();
    expect(within(reasons).getByText('4 клиента')).toBeInTheDocument();
    expect(within(reasons).getByText('2 клиента')).toBeInTheDocument();
    expect(
      within(reasons).getByText(
        'последний пересчёт 19.10.2026 15:04 · изменение модели · 10 клиентов · версия модели 2',
      ),
    ).toBeInTheDocument();
  });

  it('draws fact and forecast as different series with a legend', async () => {
    server.use(...signedInAs(admin), ...overviewHandlers());
    renderAt('/');

    const section = await screen.findByRole('region', {
      name: 'отток услуг: факт, просрочка и прогноз',
    });
    await waitFor(() => {
      expect(section.querySelector('.series-forecast .recharts-bar-rectangle')).not.toBeNull();
    });

    expect(section.querySelectorAll('.series-facts .recharts-bar-rectangle')).toHaveLength(0);
    expect(section.querySelectorAll('.series-estimated .recharts-bar-rectangle')).toHaveLength(1);
    expect(section.querySelectorAll('.series-forecast .recharts-bar-rectangle')).toHaveLength(3);
    expect(section.querySelector('.series-at-risk')).not.toBeNull();

    const forecastFill = section
      .querySelector('.series-forecast .recharts-bar-rectangle path')
      ?.getAttribute('fill');
    const estimatedFill = section
      .querySelector('.series-estimated .recharts-bar-rectangle path')
      ?.getAttribute('fill');
    const overdueFill = section
      .querySelector('.series-overdue .recharts-bar-rectangle path')
      ?.getAttribute('fill');
    expect(forecastFill).toMatch(/^url\(#forecast-/);
    expect(overdueFill).toMatch(/^url\(#overdue-/);
    expect(estimatedFill).toBe('var(--ca-chart-fact-estimated)');
    expect(section.querySelectorAll('pattern').length).toBeGreaterThanOrEqual(2);

    const legend = within(section)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(legend).toEqual([
      'удаления (факт)',
      'удаления (оценка по сроку)',
      'просроченные непродления',
      'ожидаемые непродления (прогноз)',
      'услуг под риском',
    ]);
    expect(within(section).getByText('сейчас')).toBeInTheDocument();
    expect(
      within(section).getByText(
        '90 дн. назад · 30 дн. вперёд · удаления до запуска оценены по сроку + 5 дн.',
      ),
    ).toBeInTheDocument();
  });

  it('lists the top customers by expected loss and opens a customer', async () => {
    let query = new URLSearchParams();
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/customers', ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json(defaultTop());
      }),
      ...overviewHandlers(),
    );
    const router = renderAt('/');

    const table = await screen.findByRole('table', { name: 'топ клиентов по ожидаемым потерям' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('user-0005@example.test')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('77,96')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('высокий')).toBeInTheDocument();
    expect(plain(within(rows[1]!).getByText(/3 657,38/).textContent)).toBe('3 657,38 €');
    expect(within(rows[3]!).getByText('средний')).toBeInTheDocument();
    expect(query.get('size')).toBe('10');
    expect(query.get('sort')).toBe('expectedLoss,desc');
    expect(query.get('level')).toBe('high,medium');

    await userEvent.click(within(rows[2]!).getByText('user-0009@example.test'));
    expect(router.state.location.pathname).toBe('/customers/9');
  });

  it('shows the empty state with an upload button to an administrator', async () => {
    server.use(
      ...signedInAs(admin),
      ...overviewHandlers({
        summary: summary({
          accounts: { total: 0, scored: 0, high: 0, medium: 0, low: 0, noScore: 0, pending: 0 },
          money: { expectedLoss: 0, revenueHorizon: 0, revenueAtRisk: 0, securedAmount: 0 },
          avgRiskScore: null,
          topReasons: [],
          lastRecalc: null,
        }),
      }),
    );
    renderAt('/');

    expect(await screen.findByText('данных пока нет')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'загрузить данные' })).toHaveAttribute('href', '/data');
  });

  it('shows the empty state without the button to an analyst', async () => {
    server.use(
      ...signedInAs(analyst),
      ...overviewHandlers({
        summary: summary({
          accounts: { total: 0, scored: 0, high: 0, medium: 0, low: 0, noScore: 0, pending: 0 },
        }),
      }),
    );
    renderAt('/');

    expect(await screen.findByText('данных пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'загрузить данные' })).not.toBeInTheDocument();
  });

  it('shows dashes when no customer has a score', async () => {
    server.use(
      ...signedInAs(admin),
      ...overviewHandlers({
        summary: summary({
          accounts: { total: 4, scored: 0, high: 0, medium: 0, low: 0, noScore: 4, pending: 0 },
          avgRiskScore: null,
          topReasons: [],
        }),
        top: topPage([]),
      }),
    );
    renderAt('/');

    const kpi = await screen.findByRole('region', { name: 'сводка на горизонте 30 дн.' });
    expect(within(kpi).getByText(/оценок пока нет:/)).toBeInTheDocument();
    expect(within(kpi).getAllByText('—')).toHaveLength(4);
    expect(
      await screen.findByText('клиентов с высоким или средним риском нет'),
    ).toBeInTheDocument();
  });

  it('keeps the other blocks working when one block fails and retries it', async () => {
    let attempts = 0;
    server.use(
      ...signedInAs(admin),
      http.get('*/api/v1/customers', () => {
        attempts += 1;
        return attempts === 1 ? problem(500, 'internal') : HttpResponse.json(defaultTop());
      }),
      ...overviewHandlers(),
    );
    renderAt('/');

    expect(await screen.findByText('не удалось загрузить данные')).toBeInTheDocument();
    expect(await screen.findByText('10 866,50')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'повторить' }));
    expect(
      await screen.findByRole('table', { name: 'топ клиентов по ожидаемым потерям' }),
    ).toBeInTheDocument();
  });
});
