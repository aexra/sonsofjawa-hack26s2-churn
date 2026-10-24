import type { ChurnChartPoint } from '@/entities/analytics';

export interface ChartRow {
  date: string;
  kind: ChurnChartPoint['kind'];
  deletions?: number;
  deletionsEstimated?: number;
  expectedNonRenewals?: number;
  expectedLossAmount?: number;
  servicesAtRisk?: number;
}

const present = (value: number | null | undefined): number | undefined => value ?? undefined;

export const toChartRows = (points: ChurnChartPoint[]): ChartRow[] =>
  points.map((point) => ({
    date: point.date,
    kind: point.kind,
    deletions: present(point.deletions),
    deletionsEstimated: present(point.deletionsEstimated),
    expectedNonRenewals: present(point.expectedNonRenewals),
    expectedLossAmount: present(point.expectedLossAmount),
    servicesAtRisk: present(point.servicesAtRisk),
  }));

export const todayDate = (rows: ChartRow[]): string | undefined =>
  rows.find((row) => row.kind === 'today')?.date;

export const countPastDays = (rows: ChartRow[]): number =>
  rows.filter((row) => row.kind === 'fact').length;

export const countFutureDays = (rows: ChartRow[]): number =>
  rows.filter((row) => row.kind === 'forecast').length;
