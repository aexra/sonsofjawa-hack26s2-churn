import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo } from 'react';

import { ENTITY_FIELDS, type IngestEntity } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { EmptyState } from '@/shared/ui/empty-state';

import { CellEditor } from './cell-editor';

import type { DraftRow, TableDraft } from '@/features/ingest-json-table';

const helper = createColumnHelper<DraftRow>();

declare module '@tanstack/react-table' {
  interface TableMeta<TData> {
    draft?: TData extends DraftRow ? TableDraft : never;
  }
}

const buildColumns = (entity: IngestEntity) => [
  helper.display({
    id: 'number',
    header: () => <span className="block text-right">#</span>,
    cell: ({ row, table }) => {
      const draft = table.options.meta?.draft;
      if (!draft) return null;
      const picked = draft.selected.has(row.original.key);
      return (
        <button
          type="button"
          aria-pressed={picked}
          aria-label={ru.ingest.table.pickRow(row.index + 1)}
          onClick={() => draft.toggleSelected(row.original.key)}
          className={cn(
            'h-8 w-8 cursor-pointer rounded-xs border border-transparent text-right font-mono text-caption text-ink-faint hover:border-line',
            picked && 'border-accent bg-accent-soft text-accent',
          )}
        >
          {row.index + 1}
        </button>
      );
    },
  }),
  ...ENTITY_FIELDS[entity].map((spec) =>
    helper.display({
      id: spec.key,
      header: spec.key,
      cell: ({ row, table }) => {
        const draft = table.options.meta?.draft;
        if (!draft) return null;
        return (
          <CellEditor
            spec={spec}
            rowNumber={row.index + 1}
            value={row.original.values[spec.key] ?? ''}
            error={draft.cellError(row.original.key, spec.key)}
            onChange={(value) => draft.setCell(row.original.key, spec.key, value)}
          />
        );
      },
    }),
  ),
];

export function EditableTable({ entity, draft }: { entity: IngestEntity; draft: TableDraft }) {
  const columns = useMemo(() => buildColumns(entity), [entity]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: draft.rows,
    columns,
    getRowId: (row) => row.key,
    getCoreRowModel: getCoreRowModel(),
    meta: { draft },
  });

  const widths = new Map(ENTITY_FIELDS[entity].map((spec) => [spec.key, spec.width]));

  if (draft.rows.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState kind="empty" title={ru.ingest.table.empty} text={ru.ingest.table.emptyText} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full min-w-max border-collapse text-body">
        <caption className="sr-only">{ru.ingest.table.caption(ru.ingest.entities[entity])}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="h-9 border-b border-line bg-surface-sunken px-3 text-left font-mono text-label whitespace-nowrap text-ink-muted"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'group',
                draft.selected.has(row.original.key) && '[&>td]:bg-accent-soft',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{ minWidth: widths.get(cell.column.id) }}
                  className="h-10 border-b border-line px-1 align-middle group-last:border-b-0"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
