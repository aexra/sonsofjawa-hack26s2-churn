import { useCallback } from 'react';
import { toast } from 'sonner';

import { useCustomersListParams } from '@/entities/customer';
import { CustomersColumns, useCustomerColumns } from '@/features/customers-columns';
import { CustomersFilter, CustomersFilterReset } from '@/features/customers-filter';
import { ExportCsv } from '@/features/export-csv';
import { ru } from '@/shared/i18n/ru';
import { CustomersTable } from '@/widgets/customers-table';

export function CustomersPage() {
  const [params] = useCustomersListParams();
  const columns = useCustomerColumns();
  const { reset } = columns;
  const resetColumns = useCallback(() => {
    reset();
    toast.info(ru.customers.columnsReset);
  }, [reset]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <CustomersFilter />
        <div className="ml-auto flex gap-2">
          <CustomersFilterReset />
          <CustomersColumns fields={columns.fields} onChange={columns.change} onReset={reset} />
          <ExportCsv params={params} fields={columns.fields} />
        </div>
      </div>
      <CustomersTable fields={columns.fields} onInvalidFields={resetColumns} />
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-line bg-surface px-4 py-3 text-caption text-ink-muted">
        <span>{ru.customers.helpSort}</span>
        <span>{ru.customers.helpColumns}</span>
      </div>
    </div>
  );
}
