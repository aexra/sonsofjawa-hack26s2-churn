import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import type { MouseEvent, ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDirection } | null;

interface DataColumn<Row> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  mono?: boolean;
  clamp?: boolean;
  render?: (row: Row) => ReactNode;
}

interface DataTableProps<Row> {
  columns: DataColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption: string;
  sort?: SortState;
  onSort?: (key: string, dir: SortDirection | null) => void;
  onRowClick?: (row: Row, event: MouseEvent<HTMLTableRowElement>) => void;
  isChanged?: (row: Row) => boolean;
}

const nextDirection = (current: SortDirection | null): SortDirection | null =>
  current === null ? 'asc' : current === 'asc' ? 'desc' : null;

const ariaSort = (dir: SortDirection | null) =>
  dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  sort = null,
  onSort,
  onRowClick,
  isChanged,
}: DataTableProps<Row>) {
  const helper = createColumnHelper<Row>();
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    getRowId: rowKey,
    getCoreRowModel: getCoreRowModel(),
    columns: columns.map((column) =>
      helper.display({
        id: column.key,
        header: column.label,
        cell: ({ row }) => column.render?.(row.original),
      }),
    ),
  });
  const meta = new Map(columns.map((column) => [column.key, column]));

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const column = meta.get(header.column.id);
                const dir = sort?.key === header.column.id ? sort.dir : null;
                const label = flexRender(header.column.columnDef.header, header.getContext());
                const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={column?.sortable ? ariaSort(dir) : undefined}
                    className="sticky top-0 h-9 border-b border-line bg-surface-sunken p-0 text-left text-label whitespace-nowrap text-ink-muted"
                  >
                    {column?.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort?.(header.column.id, nextDirection(dir))}
                        className={cn(
                          'flex h-9 w-full cursor-pointer items-center gap-1 px-3.5 hover:text-ink',
                          column.align === 'right' && 'justify-end',
                          dir && 'text-ink',
                        )}
                      >
                        {label}
                        <Icon aria-hidden="true" className="size-3" />
                      </button>
                    ) : (
                      <span
                        className={cn(
                          'flex h-9 items-center px-3.5',
                          column?.align === 'right' && 'justify-end',
                        )}
                      >
                        {label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={
                onRowClick
                  ? (event) => {
                      if (event.target instanceof Element && event.target.closest('a, button'))
                        return;
                      onRowClick(row.original, event);
                    }
                  : undefined
              }
              className={cn(
                'group',
                onRowClick && 'cursor-pointer hover:[&>td]:bg-surface-sunken',
                isChanged?.(row.original) && '[&>td]:bg-accent-soft',
              )}
            >
              {row.getVisibleCells().map((cell) => {
                const column = meta.get(cell.column.id);
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      'h-row border-b border-line px-3.5 align-middle group-last:border-b-0',
                      column?.align === 'right' && 'text-right tabular-nums',
                      column?.mono && 'font-mono text-data whitespace-nowrap tabular-nums',
                    )}
                  >
                    {column?.clamp ? (
                      <div className="line-clamp-2 max-w-85">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
