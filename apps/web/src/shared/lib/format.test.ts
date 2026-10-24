import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatInt,
  formatMoney,
  formatPercent,
  formatScore,
} from './format';

const plain = (value: string) => value.replaceAll(new RegExp('[\u00a0\u202f]', 'g'), ' ');

describe('format', () => {
  it('formats eurocents as euros with a comma and a currency sign', () => {
    expect(plain(formatMoney(123456))).toBe('1 234,56 €');
    expect(plain(formatMoney(719520))).toBe('7 195,20 €');
    expect(plain(formatMoney(0))).toBe('0,00 €');
  });

  it('formats integers with a space as thousands separator', () => {
    expect(plain(formatInt(1234567))).toBe('1 234 567');
  });

  it('formats score with two decimals', () => {
    expect(formatScore(77.96)).toBe('77,96');
    expect(formatScore(55)).toBe('55,00');
  });

  it('formats fractions as percents', () => {
    expect(plain(formatPercent(0.35))).toBe('35%');
  });

  it('formats date and time in the ru-RU layout', () => {
    const value = new Date(2026, 9, 19, 15, 4);
    expect(formatDateTime(value)).toBe('19.10.2026 15:04');
    expect(formatDate(value)).toBe('19.10.2026');
  });
});
