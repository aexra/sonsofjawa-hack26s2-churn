export type IngestEntity = 'accounts' | 'services' | 'transactions';

export const INGEST_ENTITIES: readonly IngestEntity[] = ['accounts', 'services', 'transactions'];

export type FieldKind = 'integer' | 'text' | 'select' | 'boolean' | 'datetime';

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  required: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: RegExp;
  options?: readonly string[];
  nullable?: boolean;
  width: string;
}

const PAYMENT_TERMS = ['hour', 'week', 'month', 'quarter_year', 'half_year', 'year'] as const;
const SERVICE_STATUSES = ['active', 'suspended', 'prolong_wait', 'blocked', 'deleted'] as const;
const TRANSACTION_STATUSES = ['not_performed', 'performed'] as const;
const TRANSACTION_TYPES = ['prolong', 'order'] as const;
const BONUS_STATES = ['locked', 'unlocked'] as const;

const id: FieldSpec = { key: 'id', kind: 'integer', required: false, min: 1, width: '72px' };
const money = (key: string): FieldSpec => ({
  key,
  kind: 'integer',
  required: false,
  min: 0,
  width: '104px',
});

export const ENTITY_FIELDS: Record<IngestEntity, readonly FieldSpec[]> = {
  accounts: [
    id,
    { key: 'email', kind: 'text', required: true, maxLength: 320, width: '220px' },
    money('balance'),
    money('withdrawBalance'),
    money('totalReplenished'),
    money('bonusBalance'),
    { key: 'bonusState', kind: 'select', required: false, options: BONUS_STATES, width: '120px' },
  ],
  services: [
    id,
    {
      key: 'name',
      kind: 'text',
      required: true,
      pattern: /^[A-Za-z0-9-]+$/,
      width: '140px',
    },
    { key: 'ownerId', kind: 'integer', required: true, min: 1, width: '96px' },
    {
      key: 'paymentTerm',
      kind: 'select',
      required: true,
      options: PAYMENT_TERMS,
      width: '132px',
    },
    { key: 'autoProlong', kind: 'boolean', required: false, width: '120px' },
    { key: 'createdAt', kind: 'datetime', required: false, width: '200px' },
    { key: 'expiresAt', kind: 'datetime', required: true, width: '200px' },
    {
      key: 'status',
      kind: 'select',
      required: true,
      options: SERVICE_STATUSES,
      width: '132px',
    },
    { key: 'price', kind: 'integer', required: true, min: 0, width: '96px' },
  ],
  transactions: [
    id,
    { key: 'amount', kind: 'integer', required: true, min: 0, max: 1000, width: '96px' },
    {
      key: 'status',
      kind: 'select',
      required: false,
      options: TRANSACTION_STATUSES,
      width: '132px',
    },
    { key: 'performedAt', kind: 'datetime', required: false, nullable: true, width: '200px' },
    { key: 'createdAt', kind: 'datetime', required: false, width: '200px' },
    { key: 'type', kind: 'select', required: true, options: TRANSACTION_TYPES, width: '112px' },
    { key: 'serviceId', kind: 'integer', required: true, min: 1, width: '104px' },
  ],
};

export const fieldKeys = (entity: IngestEntity): string[] =>
  ENTITY_FIELDS[entity].map((field) => field.key);

export const requiredFieldKeys = (entity: IngestEntity): string[] =>
  ENTITY_FIELDS[entity].filter((field) => field.required).map((field) => field.key);
