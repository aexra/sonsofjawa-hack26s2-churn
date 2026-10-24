export const safeNextPath = (raw: string | null): string => {
  if (!raw?.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
};
