const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' });
const integer = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateParts = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const formatMoney = (eurocents: number): string => money.format(eurocents / 100);

export const formatInt = (value: number): string => integer.format(value);

export const formatScore = (value: number): string => decimal.format(value);

export const formatPercent = (fraction: number): string => `${integer.format(fraction * 100)}%`;

export const formatDateTime = (value: Date | string): string => {
  const parts = Object.fromEntries(
    dateParts.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
};

export const formatDate = (value: Date | string): string => formatDateTime(value).slice(0, 10);
