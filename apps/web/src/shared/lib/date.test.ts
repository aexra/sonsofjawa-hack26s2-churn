import { describe, expect, it } from 'vitest';

import { endOfDay } from './date';

describe('endOfDay', () => {
  it('returns the last second of the given local day', () => {
    const value = endOfDay('2027-01-19');
    expect(value.getFullYear()).toBe(2027);
    expect(value.getMonth()).toBe(0);
    expect(value.getDate()).toBe(19);
    expect(value.getHours()).toBe(23);
    expect(value.getMinutes()).toBe(59);
    expect(value.getSeconds()).toBe(59);
  });
});
