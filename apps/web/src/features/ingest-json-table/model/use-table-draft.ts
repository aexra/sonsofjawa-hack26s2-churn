import { useMemo, useState } from 'react';

import { validateRow, type IngestEntity, type RowIssues } from '@/entities/ingest';

import { mergeById, newRow, type DraftRow } from './draft';

type RowsByEntity = Record<IngestEntity, DraftRow[]>;

const cellId = (rowKey: string, field: string): string => `${rowKey}:${field}`;

const without = <T>(set: ReadonlySet<T>, item: T): Set<T> => {
  const next = new Set(set);
  next.delete(item);
  return next;
};

export function useTableDraft(entity: IngestEntity) {
  const [byEntity, setByEntity] = useState<RowsByEntity>({
    accounts: [],
    services: [],
    transactions: [],
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [revealedFor, setRevealedFor] = useState<IngestEntity | null>(null);
  const [serverErrors, setServerErrors] = useState<Readonly<Record<string, string>>>({});

  const rows = byEntity[entity];
  const revealed = revealedFor === entity;

  const issues = useMemo(
    () => new Map<string, RowIssues>(rows.map((row) => [row.key, validateRow(entity, row.values)])),
    [rows, entity],
  );
  const issueCount = useMemo(
    () => [...issues.values()].reduce((sum, row) => sum + Object.keys(row).length, 0),
    [issues],
  );

  const updateRows = (update: (current: DraftRow[]) => DraftRow[]) =>
    setByEntity((current) => ({ ...current, [entity]: update(current[entity]) }));

  const cellError = (rowKey: string, field: string): string | undefined => {
    const server = serverErrors[cellId(rowKey, field)];
    if (server) return server;
    if (!revealed && !touched.has(cellId(rowKey, field))) return undefined;
    return issues.get(rowKey)?.[field];
  };

  return {
    rows,
    selected,
    issueCount,
    revealed,
    cellError,
    addRow: () => updateRows((current) => [...current, newRow(entity)]),
    removeSelected: () => {
      updateRows((current) => current.filter((row) => !selected.has(row.key)));
      setSelected(new Set());
    },
    toggleSelected: (rowKey: string) =>
      setSelected((current) =>
        current.has(rowKey) ? without(current, rowKey) : new Set(current).add(rowKey),
      ),
    setCell: (rowKey: string, field: string, value: string) => {
      updateRows((current) =>
        current.map((row) =>
          row.key === rowKey ? { key: row.key, values: { ...row.values, [field]: value } } : row,
        ),
      );
      setTouched((current) => new Set(current).add(cellId(rowKey, field)));
      setServerErrors((current) => {
        const { [cellId(rowKey, field)]: _removed, ...rest } = current;
        return rest;
      });
    },
    append: (incoming: DraftRow[]) => updateRows((current) => [...current, ...incoming]),
    merge: (incoming: DraftRow[]) => updateRows((current) => mergeById(current, incoming)),
    reveal: () => setRevealedFor(entity),
    setServerErrors,
    clear: () => {
      updateRows(() => []);
      setSelected(new Set());
      setServerErrors({});
      setRevealedFor(null);
    },
  };
}

export type TableDraft = ReturnType<typeof useTableDraft>;
