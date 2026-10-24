import { describe, expect, it } from 'vitest';

import { parseRuntimeConfig, runtimeConfig } from './runtime';

describe('runtime config', () => {
  it('reads the injected config', () => {
    expect(runtimeConfig.apiBaseUrl).toBe('http://localhost:3000/api/v1');
  });

  it('rejects a config of the wrong shape', () => {
    expect(() => parseRuntimeConfig({ apiBaseUrl: '' })).toThrow();
  });
});
