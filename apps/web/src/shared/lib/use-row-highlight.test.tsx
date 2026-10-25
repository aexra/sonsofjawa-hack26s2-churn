import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HIGHLIGHT_MS, useRowHighlight } from './use-row-highlight';

interface Row {
  id: number;
  riskScore: number;
  expectedLoss: number;
}

const row = (id: number, riskScore: number, expectedLoss: number): Row => ({
  id,
  riskScore,
  expectedLoss,
});

const setup = (initial: Row[] | undefined) =>
  renderHook(
    ({ rows }: { rows: Row[] | undefined }) =>
      useRowHighlight({
        rows,
        rowKey: (item) => String(item.id),
        signature: (item) => `${item.riskScore}:${item.expectedLoss}`,
      }),
    { initialProps: { rows: initial } },
  );

describe('useRowHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not highlight anything on the first load', () => {
    const { result } = setup([row(1, 10, 100), row(2, 20, 200)]);

    expect(result.current(row(1, 10, 100))).toBe(false);
    expect(result.current(row(2, 20, 200))).toBe(false);
  });

  it('highlights only rows whose score or loss changed, then clears after two seconds', () => {
    const { result, rerender } = setup([row(1, 10, 100), row(2, 20, 200), row(3, 30, 300)]);

    rerender({ rows: [row(1, 10, 100), row(2, 25, 200), row(3, 30, 350)] });

    expect(result.current(row(1, 10, 100))).toBe(false);
    expect(result.current(row(2, 25, 200))).toBe(true);
    expect(result.current(row(3, 30, 350))).toBe(true);

    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_MS - 1);
    });
    expect(result.current(row(2, 25, 200))).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current(row(2, 25, 200))).toBe(false);
    expect(result.current(row(3, 30, 350))).toBe(false);
  });

  it('ignores rows that appear or disappear', () => {
    const { result, rerender } = setup([row(1, 10, 100)]);

    rerender({ rows: [row(2, 20, 200)] });

    expect(result.current(row(2, 20, 200))).toBe(false);
  });

  it('does not compare against rows from before the data was cleared', () => {
    const { result, rerender } = setup([row(1, 10, 100)]);

    rerender({ rows: undefined });
    rerender({ rows: [row(1, 99, 100)] });

    expect(result.current(row(1, 99, 100))).toBe(false);
  });

  it('restarts the timer when another change arrives', () => {
    const { result, rerender } = setup([row(1, 10, 100)]);

    rerender({ rows: [row(1, 11, 100)] });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    rerender({ rows: [row(1, 12, 100)] });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current(row(1, 12, 100))).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current(row(1, 12, 100))).toBe(false);
  });
});
