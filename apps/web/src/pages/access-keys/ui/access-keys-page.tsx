import { CreateApiKey } from '@/features/api-key-create';
import { ru } from '@/shared/i18n/ru';
import { ApiKeysTable } from '@/widgets/api-keys-table';

export function AccessKeysPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-180 text-ink-muted">
          {ru.access.keys.intro} <span className="font-mono text-ink">{ru.access.keys.header}</span>
          .
        </p>
        <CreateApiKey />
      </div>
      <ApiKeysTable />
    </div>
  );
}
