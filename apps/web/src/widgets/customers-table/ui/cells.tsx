import { ReasonText } from '@/entities/reason';
import { RiskBadge } from '@/entities/risk-level';
import { ru } from '@/shared/i18n/ru';
import { formatDateTime, formatInt, formatMoney, formatScore } from '@/shared/lib/format';
import { Tooltip } from '@/shared/ui/tooltip';

import type { CustomerField, CustomerRow } from '@/entities/customer';
import type { ReactNode } from 'react';

const dash = ru.common.emptyValue;

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? dash : formatMoney(value);
const integer = (value: number | null | undefined) =>
  value === null || value === undefined ? dash : formatInt(value);
const decimal = (value: number | null | undefined) =>
  value === null || value === undefined ? dash : formatScore(value);
const date = (value: string | null | undefined) =>
  value === null || value === undefined ? dash : formatDateTime(value);

const level = (row: CustomerRow) =>
  row.riskLevel ?? (row.scoreStatus === 'pending' ? 'pending' : 'none');

function TruncatedText({ text }: { text: string }) {
  if (text === '') return dash;
  return (
    <Tooltip content={text}>
      <span className="block max-w-65 truncate">{text}</span>
    </Tooltip>
  );
}

function TopReason({ row }: { row: CustomerRow }) {
  if (row.topReason) return <ReasonText reason={row.topReason} />;
  if (row.noScoreReason) {
    return <span className="text-ink-muted">{ru.customers.noScoreReason[row.noScoreReason]}</span>;
  }
  return dash;
}

export const renderCell = (
  field: CustomerField,
  row: CustomerRow,
  mergedLevel: boolean,
): ReactNode => {
  switch (field) {
    case 'id':
      return row.id === undefined ? dash : String(row.id);
    case 'email':
      return row.email ?? dash;
    case 'balance':
      return money(row.balance);
    case 'withdrawBalance':
      return money(row.withdrawBalance);
    case 'totalReplenished':
      return money(row.totalReplenished);
    case 'bonusBalance':
      return money(row.bonusBalance);
    case 'bonusState':
      return row.bonusState ? ru.customers.bonusState[row.bonusState] : dash;
    case 'scoreStatus':
      return row.scoreStatus ? ru.customers.scoreStatus[row.scoreStatus] : dash;
    case 'noScoreReason':
      return row.noScoreReason ? ru.customers.noScoreReason[row.noScoreReason] : dash;
    case 'riskScore':
      return mergedLevel ? (
        <RiskBadge level={level(row)} score={row.riskScore ?? null} />
      ) : (
        decimal(row.riskScore)
      );
    case 'riskLevel':
      return <RiskBadge level={level(row)} />;
    case 'loyalty':
      return decimal(row.loyalty);
    case 'expectedLoss':
      return row.expectedLoss === null || row.expectedLoss === undefined ? (
        dash
      ) : (
        <b className="font-semibold">{formatMoney(row.expectedLoss)}</b>
      );
    case 'revenueHorizon':
      return money(row.revenueHorizon);
    case 'securedAmount':
      return money(row.securedAmount);
    case 'servicesTotal':
      return integer(row.servicesTotal);
    case 'servicesLive':
      return integer(row.servicesLive);
    case 'servicesAtRisk':
      return integer(row.servicesAtRisk);
    case 'nextExpiryAt':
      return date(row.nextExpiryAt);
    case 'topReason':
      return <TopReason row={row} />;
    case 'reasons':
      return <TruncatedText text={(row.reasons ?? []).map((reason) => reason.text).join('; ')} />;
    case 'anomalies':
      return (
        <TruncatedText
          text={(row.anomalies ?? [])
            .map((anomaly) => ru.customers.anomalyLabels[anomaly])
            .join('; ')}
        />
      );
    case 'calculatedAt':
      return date(row.calculatedAt);
    case 'asOf':
      return date(row.asOf);
    case 'modelVersion':
      return integer(row.modelVersion);
  }
};

const RIGHT: ReadonlySet<CustomerField> = new Set([
  'id',
  'balance',
  'withdrawBalance',
  'totalReplenished',
  'bonusBalance',
  'loyalty',
  'expectedLoss',
  'revenueHorizon',
  'securedAmount',
  'servicesTotal',
  'servicesLive',
  'servicesAtRisk',
  'modelVersion',
]);

const MONO: ReadonlySet<CustomerField> = new Set([
  ...RIGHT,
  'email',
  'nextExpiryAt',
  'calculatedAt',
  'asOf',
]);

export const isRightAligned = (field: CustomerField) => RIGHT.has(field);
export const isMono = (field: CustomerField) => MONO.has(field);
