import type { ScoreHistoryPoint } from '@/entities/customer';

export type Period = '7' | '30' | 'all';

export interface HistoryRow {
  time: number;
  riskScore: number | null;
  loss: number | null;
  modelVersion: number;
}

const MS_PER_DAY = 86_400_000;

export const MIN_CHART_POINTS = 3;

export const withinPeriod = (points: ScoreHistoryPoint[], period: Period): ScoreHistoryPoint[] => {
  const latest = points[points.length - 1];
  if (period === 'all' || latest === undefined) return points;
  const from = new Date(latest.calculatedAt).getTime() - Number(period) * MS_PER_DAY;
  return points.filter((point) => new Date(point.calculatedAt).getTime() >= from);
};

export const toRows = (points: ScoreHistoryPoint[]): HistoryRow[] =>
  points.map((point) => ({
    time: new Date(point.calculatedAt).getTime(),
    riskScore: point.riskScore ?? null,
    loss:
      point.expectedLoss === null || point.expectedLoss === undefined
        ? null
        : point.expectedLoss / 100,
    modelVersion: point.modelVersion,
  }));

export const versionChanges = (rows: HistoryRow[]): HistoryRow[] =>
  rows.filter((row, index) => index > 0 && rows[index - 1]?.modelVersion !== row.modelVersion);
