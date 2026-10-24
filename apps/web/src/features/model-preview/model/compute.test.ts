import { describe, expect, it } from 'vitest';

import { modelSettings, tmpltCustomers } from '@/test/model-fixtures';

import { computePreview, type PreviewCustomer } from './compute';

import type { components } from '@/shared/api/schema';

const settings = modelSettings() as unknown as components['schemas']['ModelSettings'];

const customers: PreviewCustomer[] = tmpltCustomers.map((customer) => ({
  id: customer.id,
  riskScore: customer.riskScore,
  riskLevel: customer.riskLevel as PreviewCustomer['riskLevel'],
  reasons: customer.reasons,
  gap: customer.revenueHorizon - customer.securedAmount,
}));

const saved = Object.fromEntries(
  settings.groups.flatMap((group) => group.settings.map((setting) => [setting.key, setting.value])),
);

describe('computePreview', () => {
  it('reproduces the reference losses for the weight 30 to 40 change', () => {
    const preview = computePreview(customers, settings, { ...saved, weight_prolong_wait: 40 });
    expect(preview?.lossBefore).toBe(681905);
    expect(preview?.lossAfter).toBe(662652);
    expect(preview?.levelChanges).toBe(0);
    expect(preview?.rows.map((row) => [row.id, row.scoreAfter])).toEqual([
      [9, 51.17],
      [10, 59.09],
      [1, 22.71],
      [4, 21.21],
      [5, 80.43],
      [6, 17.44],
    ]);
  });

  it('lists customers whose level changes first', () => {
    const preview = computePreview(customers, settings, { ...saved, level_high: 60 });
    expect(preview?.levelChanges).toBe(2);
    expect(preview?.rows.map((row) => row.id)).toEqual([9, 10]);
    expect(preview?.rows.map((row) => row.levelAfter)).toEqual(['medium', 'medium']);
  });

  it('returns nothing for an unusable draft', () => {
    expect(
      computePreview(customers, settings, { ...saved, weight_prolong_wait: Number.NaN }),
    ).toBeNull();
    const zero = Object.fromEntries(Object.keys(saved).map((key) => [key, 0]));
    expect(computePreview(customers, settings, zero)).toBeNull();
  });
});
