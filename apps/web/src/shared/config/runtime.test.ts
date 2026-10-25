import { describe, expect, it } from 'vitest';

import { parseRuntimeConfig, runtimeConfig } from './runtime';

describe('runtime config', () => {
  it('reads the injected config', () => {
    expect(runtimeConfig.apiBaseUrl).toBe('http://localhost:3000/api/v1');
    expect(runtimeConfig.demoUser).toBe('');
  });

  it('defaults a missing demo user to empty', () => {
    expect(
      parseRuntimeConfig({
        apiBaseUrl: '/api/v1',
        docsUrl: '/api/v1/docs',
        grafanaUrl: '',
      }).demoUser,
    ).toBe('');
  });

  it('keeps a configured demo user', () => {
    expect(
      parseRuntimeConfig({
        apiBaseUrl: '/api/v1',
        docsUrl: '/api/v1/docs',
        grafanaUrl: '',
        demoUser: 'test/test',
      }).demoUser,
    ).toBe('test/test');
  });

  it('rejects a config of the wrong shape', () => {
    expect(() => parseRuntimeConfig({ apiBaseUrl: '' })).toThrow();
  });
});
