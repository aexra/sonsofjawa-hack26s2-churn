import { describe, expect, it } from 'vitest';

import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it('keeps local paths', () => {
    expect(safeNextPath('/customers?level=high')).toBe('/customers?level=high');
  });

  it.each([null, '', 'customers', '//evil.test', '/\\evil.test', 'https://evil.test'])(
    'falls back to the root for %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/');
    },
  );
});
