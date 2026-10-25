import { HttpResponse, http } from 'msw';

const weightSetting = (
  key: string,
  title: string,
  value: number,
  defaultValue: number,
  description = `вес признака: ${title}`,
) => ({
  key,
  value,
  defaultValue,
  min: 0,
  max: 100,
  unit: 'points',
  title,
  description,
  share: null,
});

const plain = (
  key: string,
  title: string,
  value: number,
  min: number,
  max: number,
  unit: 'points' | 'days' | 'hours' | 'count',
) => ({
  key,
  value,
  defaultValue: value,
  min,
  max,
  unit,
  title,
  description: `${title}: описание`,
});

export const modelSettings = (overrides: { prolongWait?: number; version?: number } = {}) => ({
  modelVersion: overrides.version ?? 2,
  updatedAt: '2026-10-19T15:04:00Z',
  updatedBy: 'admin',
  clock: {
    mode: 'frozen',
    asOf: '2026-10-19T15:00:00Z',
    frozenAt: '2026-10-19T15:00:00Z',
    shiftSeconds: 0,
    updatedAt: '2026-10-19T15:04:00Z',
    updatedBy: 'admin',
  },
  groups: [
    {
      key: 'weights',
      settings: [
        weightSetting('weight_renewal_unsecured', 'продление не обеспечено', 25, 25),
        weightSetting('weight_insufficient_funds', 'нехватка средств на продления', 25, 25),
        weightSetting(
          'weight_prolong_wait',
          'услуги в ожидании оплаты',
          overrides.prolongWait ?? 30,
          30,
        ),
        weightSetting('weight_suspended_share', 'выключенные клиентом услуги', 10, 10),
        weightSetting('weight_termination_history', 'история удалений', 5, 5),
        weightSetting('weight_payment_failures', 'просроченные продления', 5, 5),
      ],
    },
    {
      key: 'levels',
      settings: [
        plain('level_high', 'порог высокого риска', 50, 1, 100, 'points'),
        plain('level_medium', 'порог среднего риска', 25, 0, 99, 'points'),
      ],
    },
    {
      key: 'horizon',
      settings: [
        plain('horizon_days', 'горизонт прогноза', 30, 1, 365, 'days'),
        plain('grace_days', 'срок ожидания оплаты', 5, 0, 30, 'days'),
      ],
    },
    {
      key: 'quality',
      settings: [
        plain('max_score_age_hours', 'максимальный возраст оценки', 6, 1, 168, 'hours'),
        plain('min_transactions', 'минимум транзакций', 2, 1, 100, 'count'),
      ],
    },
  ],
  features: [
    ['renewal_unsecured', 'продление не обеспечено'],
    ['insufficient_funds', 'нехватка средств на продления'],
    ['prolong_wait', 'услуги в ожидании оплаты'],
    ['suspended_share', 'выключенные клиентом услуги'],
    ['termination_history', 'история удалений'],
    ['payment_failures', 'просроченные продления'],
  ].map(([key, title]) => ({
    key,
    weightKey: `weight_${key}`,
    title,
    description: `формула: ${title}`,
    reasonTemplate: '{count}',
  })),
});

const reason = (key: string, value: number) => ({
  key,
  title: key,
  text: key,
  value,
  weight: 0,
  contribution: 0,
  params: {},
});

const scored = (
  id: number,
  riskScore: number,
  riskLevel: string,
  revenueHorizon: number,
  securedAmount: number,
  reasons: [string, number][],
) => ({
  id,
  riskScore,
  riskLevel,
  revenueHorizon,
  securedAmount,
  reasons: reasons.map(([key, value]) => reason(key, value)),
});

export const tmpltCustomers = [
  scored(1, 24.98, 'low', 68904, 145, [['renewal_unsecured', 0.9993]]),
  scored(4, 23.33, 'low', 1281, 1009, [
    ['renewal_unsecured', 0.5333],
    ['suspended_share', 1],
  ]),
  scored(5, 78.47, 'high', 469136, 0, [
    ['renewal_unsecured', 1],
    ['insufficient_funds', 1 - 286.57 / 4697.65],
    ['prolong_wait', 1],
  ]),
  scored(6, 19.18, 'low', 2416, 27, [['renewal_unsecured', 0.7673]]),
  scored(9, 56.29, 'high', 616532, 91506, [
    ['renewal_unsecured', 1],
    ['insufficient_funds', 1 - 915.06 / 6164.5],
    ['suspended_share', 1],
  ]),
  scored(10, 55, 'high', 982, 0, [
    ['renewal_unsecured', 1],
    ['prolong_wait', 1],
  ]),
];

const customersPage = (items: unknown[], totalItems = items.length) =>
  HttpResponse.json({
    items,
    fields: [],
    sort: [],
    page: 0,
    size: 500,
    totalItems,
    totalPages: Math.max(Math.ceil(totalItems / 500), 1),
  });

export const previewListing = (items: unknown[] = tmpltCustomers, totalItems = items.length) =>
  http.get('*/api/v1/customers', () => customersPage(items, totalItems));

export const revisions = [
  {
    version: 2,
    changedAt: '2026-10-19T15:04:00Z',
    changedBy: 'admin',
    source: 'settings',
    changes: [{ key: 'weight_prolong_wait', from: 30, to: 40 }],
  },
  {
    version: 1,
    changedAt: '2026-10-19T14:58:00Z',
    changedBy: 'system',
    source: 'migration',
    changes: [{ file: 'R__risk_model.sql' }],
  },
];
