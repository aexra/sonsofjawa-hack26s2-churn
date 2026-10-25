import { useEffect, useState } from 'react';

export const HIGHLIGHT_MS = 2000;

interface RowHighlightOptions<Row> {
  rows: readonly Row[] | undefined;
  rowKey: (row: Row) => string;
  signature: (row: Row) => string;
  durationMs?: number;
}

interface Snapshot<Row> {
  rows: readonly Row[] | undefined;
  signatures: ReadonlyMap<string, string>;
}

const empty: ReadonlySet<string> = new Set();

export function useRowHighlight<Row>({
  rows,
  rowKey,
  signature,
  durationMs = HIGHLIGHT_MS,
}: RowHighlightOptions<Row>): (row: Row) => boolean {
  const [snapshot, setSnapshot] = useState<Snapshot<Row>>({
    rows: undefined,
    signatures: new Map(),
  });
  const [changed, setChanged] = useState<ReadonlySet<string>>(empty);

  if (rows !== snapshot.rows) {
    const signatures = new Map((rows ?? []).map((row) => [rowKey(row), signature(row)]));
    const modified = [...signatures].filter(([key, value]) => {
      const before = snapshot.signatures.get(key);
      return before !== undefined && before !== value;
    });
    setSnapshot({ rows, signatures });
    if (modified.length > 0) setChanged(new Set(modified.map(([key]) => key)));
  }

  useEffect(() => {
    if (changed.size === 0) return;
    const timer = setTimeout(() => setChanged(empty), durationMs);
    return () => clearTimeout(timer);
  }, [changed, durationMs]);

  return (row) => changed.has(rowKey(row));
}
