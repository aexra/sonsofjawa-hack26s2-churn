import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  CUSTOMER_FIELDS,
  EMPTY_FILTER,
  hasActiveFilter,
  isSortableField,
  PAGE_SIZES,
  useCustomers,
  useCustomersListParams,
  type CustomerField,
  type CustomerRow,
  type PageSize,
} from '@/entities/customer';
import { ApiError } from '@/shared/api/api-error';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { DataTable, type SortDirection } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Select } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';

import { isMono, isRightAligned, renderCell } from './cells';

import type { MouseEvent } from 'react';

interface CustomersTableProps {
  fields: readonly CustomerField[];
  onInvalidFields: () => void;
}

const known = new Set<string>(CUSTOMER_FIELDS.map((field) => field.key));

const fieldLabel = (field: string) =>
  known.has(field) ? ru.customers.fields[field as CustomerField] : field;

const customerPath = (row: CustomerRow) => `/customers/${String(row.id)}`;

export function CustomersTable({ fields, onInvalidFields }: CustomersTableProps) {
  const [params, update] = useCustomersListParams();
  const navigate = useNavigate();
  const customers = useCustomers(params, fields);
  const error = customers.error;
  const invalidFields = error instanceof ApiError && error.code === 'invalid_field';

  useEffect(() => {
    if (invalidFields) onInvalidFields();
  }, [invalidFields, error, onInvalidFields]);

  if (customers.isPending || invalidFields) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-line bg-surface p-3">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-row" />
        ))}
      </div>
    );
  }
  if (customers.isError) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState
          kind="error"
          title={ru.common.loadFailed}
          text={ru.common.loadFailedText}
          action={<Button onClick={() => void customers.refetch()}>{ru.common.retry}</Button>}
        />
      </div>
    );
  }

  const page = customers.data;
  if (page.totalItems === 0) {
    const filtered = hasActiveFilter(params);
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState
          kind={filtered ? 'filter' : 'empty'}
          title={filtered ? ru.customers.emptyFiltered : ru.customers.emptyAll}
          text={filtered ? ru.customers.emptyFilteredText : ru.customers.emptyAllText}
          action={
            filtered ? (
              <Button
                size="sm"
                onClick={() => {
                  update(EMPTY_FILTER);
                }}
              >
                {ru.customers.resetFilters}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const shown = fields.filter((field) => known.has(field));
  const mergedLevel = shown.includes('riskScore') && shown.includes('riskLevel');
  const visible = shown.filter((field) => !(mergedLevel && field === 'riskLevel'));
  const from = page.page * page.size + 1;
  const to = page.page * page.size + page.items.length;
  const sortLabel = params.sort
    ? `${fieldLabel(params.sort.field)}, ${
        params.sort.dir === 'asc' ? ru.customers.sortAsc : ru.customers.sortDesc
      }`
    : ru.customers.sortDefault;

  const open = (row: CustomerRow, event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      window.open(customerPath(row), '_blank', 'noopener');
      return;
    }
    void navigate(customerPath(row));
  };

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        caption={ru.customers.caption}
        rows={page.items}
        rowKey={(row) => String(row.id)}
        sort={params.sort ? { key: params.sort.field, dir: params.sort.dir } : null}
        onSort={(key: string, dir: SortDirection | null) => {
          update({ sort: dir ? { field: key, dir } : null });
        }}
        onRowClick={open}
        columns={visible.map((field, index) => ({
          key: field,
          label: ru.customers.fields[field],
          sortable: isSortableField(field),
          align: isRightAligned(field) ? 'right' : 'left',
          mono: isMono(field),
          render: (row: CustomerRow) =>
            index === 0 ? (
              <Link
                to={customerPath(row)}
                aria-label={ru.customers.openCustomer(row.id ?? 0)}
                className="text-inherit no-underline hover:underline"
              >
                {renderCell(field, row, mergedLevel)}
              </Link>
            ) : (
              renderCell(field, row, mergedLevel)
            ),
        }))}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-muted">
        <span>
          {ru.customers.showing}{' '}
          <b className="font-medium text-ink">
            {from}–{to}
          </b>{' '}
          {ru.customers.of} <b className="font-medium text-ink">{page.totalItems}</b> ·{' '}
          {ru.customers.sortBy}: {sortLabel}
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="customers-page-size">{ru.customers.pageSize}</label>
          <Select
            id="customers-page-size"
            value={String(params.size)}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            onValueChange={(value) => {
              update({ size: Number(value) as PageSize });
            }}
          />
          <Button
            size="sm"
            disabled={page.page === 0}
            onClick={() => {
              update({ page: page.page - 1 });
            }}
          >
            {ru.customers.prev}
          </Button>
          <Button
            size="sm"
            disabled={page.page + 1 >= page.totalPages}
            onClick={() => {
              update({ page: page.page + 1 });
            }}
          >
            {ru.customers.next}
          </Button>
        </div>
      </div>
    </div>
  );
}
