import { Info } from 'lucide-react';
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
      <CustomersFilter>
        <CustomersFilterReset />
        <CustomersColumns fields={columns.fields} onChange={columns.change} onReset={reset} />
        <ExportCsv params={params} fields={columns.fields} />
      </CustomersFilter>
      <CustomersTable fields={columns.fields} onInvalidFields={resetColumns} />
      <p className="m-0 flex flex-wrap items-start gap-x-6 gap-y-2 rounded-sm bg-surface-sunken px-4 py-3 text-caption text-ink-muted">
        <Info aria-hidden="true" className="mt-px size-4 flex-none" />
        <span>{ru.customers.helpSort}</span>
        <span>{ru.customers.helpColumns}</span>
      </p>
    </div>
  );
}
