const pad = (value: number): string => String(value).padStart(2, '0');

export const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInput = (local: string): string | null => {
  if (local === '') return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
