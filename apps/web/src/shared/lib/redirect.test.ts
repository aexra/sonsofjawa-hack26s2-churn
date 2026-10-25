import { describe, expect, it } from 'vitest';

import { isServerPath, safeNextPath } from './redirect';

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

describe('isServerPath', () => {
  it('detects pages served by the api', () => {
    expect(isServerPath('/api/v1/docs')).toBe(true);
  });

  it('keeps app routes inside the router', () => {
    expect(isServerPath('/customers')).toBe(false);
  });
});
