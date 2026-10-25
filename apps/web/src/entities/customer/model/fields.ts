import type { components } from '@/shared/api/schema';

export type CustomerField = components['schemas']['CustomerField'];
export type CustomerRow = components['schemas']['CustomerRow'];
export type CustomerPage = components['schemas']['CustomerPage'];
export type CustomerRiskLevel = components['schemas']['RiskLevel'];
export type ScoreStatus = components['schemas']['ScoreStatus'];

export const CUSTOMER_FIELDS: readonly { key: CustomerField; sortable: boolean }[] = [
  { key: 'id', sortable: true },
  { key: 'email', sortable: true },
  { key: 'balance', sortable: true },
  { key: 'withdrawBalance', sortable: true },
  { key: 'totalReplenished', sortable: true },
  { key: 'bonusBalance', sortable: true },
  { key: 'bonusState', sortable: false },
  { key: 'scoreStatus', sortable: false },
  { key: 'noScoreReason', sortable: false },
  { key: 'riskScore', sortable: true },
  { key: 'riskLevel', sortable: true },
  { key: 'loyalty', sortable: true },
  { key: 'expectedLoss', sortable: true },
  { key: 'revenueHorizon', sortable: true },
  { key: 'securedAmount', sortable: true },
  { key: 'servicesTotal', sortable: true },
  { key: 'servicesLive', sortable: true },
  { key: 'servicesAtRisk', sortable: true },
  { key: 'nextExpiryAt', sortable: true },
  { key: 'topReason', sortable: false },
  { key: 'reasons', sortable: false },
  { key: 'anomalies', sortable: false },
  { key: 'calculatedAt', sortable: true },
  { key: 'asOf', sortable: false },
  { key: 'modelVersion', sortable: false },
];

export const DEFAULT_FIELDS: readonly CustomerField[] = [
  'id',
  'email',
  'balance',
  'totalReplenished',
  'riskScore',
  'riskLevel',
  'topReason',
  'expectedLoss',
];

const sortable = new Set<string>(CUSTOMER_FIELDS.filter((f) => f.sortable).map((f) => f.key));

export const isSortableField = (key: string): boolean => sortable.has(key);
