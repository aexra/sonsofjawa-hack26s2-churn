import { customersSearch, type CustomerField, type ListParams } from '@/entities/customer';
import { runtimeConfig } from '@/shared/config/runtime';
import { ru } from '@/shared/i18n/ru';
import { buttonVariants } from '@/shared/ui/button';

interface ExportCsvProps {
  params: ListParams;
  fields: readonly CustomerField[];
}

export function ExportCsv({ params, fields }: ExportCsvProps) {
  const href = `${runtimeConfig.apiBaseUrl}/customers/export?${customersSearch(params, fields, false).toString()}`;
  return (
    <a href={href} download className={buttonVariants({ size: 'sm' })}>
      {ru.customers.exportCsv}
    </a>
  );
}
