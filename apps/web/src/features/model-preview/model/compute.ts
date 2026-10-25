import type { components } from '@/shared/api/schema';

type ModelSettings = components['schemas']['ModelSettings'];
type RiskLevel = components['schemas']['RiskLevel'];

export interface PreviewCustomer {
  id: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: readonly { key: string; value: number }[];
  gap: number;
}

export interface PreviewRow {
  id: number;
  scoreBefore: number;
  levelBefore: RiskLevel;
  scoreAfter: number;
  levelAfter: RiskLevel;
}

export interface Preview {
  rows: PreviewRow[];
  levelChanges: number;
  lossBefore: number;
  lossAfter: number;
}

const LEVEL_HIGH = 'level_high';
const LEVEL_MEDIUM = 'level_medium';
const TOP_BY_DELTA = 10;

const savedValues = (settings: ModelSettings): Record<string, number> =>
  Object.fromEntries(
    settings.groups.flatMap((group) =>
      group.settings.map((setting) => [setting.key, setting.value]),
    ),
  );

const weightKeys = (settings: ModelSettings): string[] =>
  settings.groups
    .filter((group) => group.key === 'weights')
    .flatMap((group) => group.settings.map((setting) => setting.key));

const level = (score: number, values: Record<string, number>): RiskLevel => {
  if (score >= (values[LEVEL_HIGH] ?? Infinity)) return 'high';
  if (score >= (values[LEVEL_MEDIUM] ?? Infinity)) return 'medium';
  return 'low';
};

const isUsable = (values: Record<string, number>, keys: readonly string[]): boolean =>
  keys.every((key) => Number.isFinite(values[key])) &&
  keys.reduce((sum, key) => sum + (values[key] ?? 0), 0) > 0 &&
  Number.isFinite(values[LEVEL_HIGH]) &&
  Number.isFinite(values[LEVEL_MEDIUM]);

export const computePreview = (
  customers: readonly PreviewCustomer[],
  settings: ModelSettings,
  draft: Record<string, number>,
): Preview | null => {
  const keys = weightKeys(settings);
  const saved = savedValues(settings);
  if (!isUsable(draft, keys) || !isUsable(saved, keys)) return null;

  const weightOf = new Map(settings.features.map((feature) => [feature.key, feature.weightKey]));
  const totalOf = (values: Record<string, number>) =>
    keys.reduce((sum, key) => sum + (values[key] ?? 0), 0);
  const savedTotal = totalOf(saved);
  const draftTotal = totalOf(draft);

  const scoreOf = (customer: PreviewCustomer, values: Record<string, number>, total: number) => {
    const weighted = customer.reasons.reduce((sum, reason) => {
      const weightKey = weightOf.get(reason.key);
      return sum + (weightKey === undefined ? 0 : reason.value * (values[weightKey] ?? 0));
    }, 0);
    return Math.round((10000 * weighted) / total) / 100;
  };
  const lossOf = (customer: PreviewCustomer, score: number) =>
    Math.round((score / 100) * customer.gap);

  let lossBefore = 0;
  let lossAfter = 0;
  const impacts = customers.map((customer) => {
    const scoreSaved = scoreOf(customer, saved, savedTotal);
    const scoreAfter = scoreOf(customer, draft, draftTotal);
    lossBefore += lossOf(customer, scoreSaved);
    lossAfter += lossOf(customer, scoreAfter);
    const levelAfter = level(scoreAfter, draft);
    return {
      row: {
        id: customer.id,
        scoreBefore: customer.riskScore,
        levelBefore: customer.riskLevel,
        scoreAfter,
        levelAfter,
      },
      delta: Math.abs(scoreAfter - scoreSaved),
      levelChanged: level(scoreSaved, saved) !== levelAfter,
    };
  });

  type Impact = (typeof impacts)[number];
  const byDelta = (a: Impact, b: Impact) => b.delta - a.delta || a.row.id - b.row.id;
  const changed = impacts.filter((impact) => impact.levelChanged).sort(byDelta);
  const moved = impacts
    .filter((impact) => !impact.levelChanged && impact.delta > 0)
    .sort(byDelta)
    .slice(0, TOP_BY_DELTA);

  return {
    rows: [...changed, ...moved].map((impact) => impact.row),
    levelChanges: changed.length,
    lossBefore,
    lossAfter,
  };
};
