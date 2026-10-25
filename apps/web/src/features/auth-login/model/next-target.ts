import { safeNextPath } from '@/shared/lib/redirect';

const STORAGE_KEY = 'login-next';

export const rememberNextTarget = (path: string): void => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    return;
  }
};

export const clearNextTarget = (): void => {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
};

export const takeNextTarget = (): string | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return raw === null ? null : safeNextPath(raw);
  } catch {
    return null;
  }
};
