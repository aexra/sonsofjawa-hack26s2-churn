export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';

export const getStoredTheme = (): ThemeMode => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

export const applyTheme = (mode: ThemeMode): void => {
  if (mode === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = mode;
  }
  try {
    if (mode === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {
    return;
  }
};
