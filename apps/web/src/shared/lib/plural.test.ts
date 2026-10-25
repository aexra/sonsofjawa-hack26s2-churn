import { describe, expect, it } from 'vitest';

import { plural } from './plural';

const forms = { one: 'клиент', few: 'клиента', many: 'клиентов' };

describe('plural', () => {
  it('picks the Russian form by count', () => {
    expect(plural(1, forms)).toBe('клиент');
    expect(plural(2, forms)).toBe('клиента');
    expect(plural(4, forms)).toBe('клиента');
    expect(plural(5, forms)).toBe('клиентов');
    expect(plural(11, forms)).toBe('клиентов');
    expect(plural(21, forms)).toBe('клиент');
    expect(plural(0, forms)).toBe('клиентов');
  });
});
