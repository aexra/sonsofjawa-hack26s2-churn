import { describe, expect, it } from 'vitest';

import { fromLocalInput, toLocalInput } from './local-datetime';

describe('local datetime input', () => {
  it('round-trips a moment through the local input format', () => {
    const iso = '2026-10-19T15:00:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it('formats the local wall clock time', () => {
    const local = new Date(2026, 9, 19, 8, 5);
    expect(toLocalInput(local.toISOString())).toBe('2026-10-19T08:05');
  });

  it('rejects an empty or broken value', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('not a date')).toBeNull();
    expect(toLocalInput('not a date')).toBe('');
  });
});
