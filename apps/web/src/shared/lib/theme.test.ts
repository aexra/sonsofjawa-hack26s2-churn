import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, getStoredTheme } from './theme';

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('defaults to the system theme', () => {
    expect(getStoredTheme()).toBe('system');
  });

  it('stores an explicit choice and sets the attribute', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('removes the attribute and the stored value for the system theme', () => {
    applyTheme('light');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(getStoredTheme()).toBe('system');
  });

  it('works when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getStoredTheme()).toBe('system');
    expect(() => {
      applyTheme('dark');
    }).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
