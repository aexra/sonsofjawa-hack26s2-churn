const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * 1024;

export const formatFileSize = (
  bytes: number,
  units: { kilobytes: (value: string) => string; megabytes: (value: string) => string },
): string =>
  bytes >= MEGABYTE
    ? units.megabytes(decimal.format(bytes / MEGABYTE))
    : units.kilobytes(decimal.format(Math.max(bytes, 1) / KILOBYTE));
