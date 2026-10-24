const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });

export const formatNumber = (value: number): string => number.format(value);
