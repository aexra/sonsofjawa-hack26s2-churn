import { ru } from '@/shared/i18n/ru';
import { plural } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';

interface SubmitBarProps {
  rowCount: number;
  issueCount: number;
  revealed: boolean;
  isPending: boolean;
  onSubmit: () => void;
}

export function SubmitBar({ rowCount, issueCount, revealed, isPending, onSubmit }: SubmitBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {revealed && issueCount > 0 && (
          <span role="alert" className="text-caption font-medium text-negative">
            {ru.ingest.table.issues(issueCount, plural(issueCount, ru.ingest.cellForms))}
          </span>
        )}
        <span className="text-caption text-ink-muted">{ru.ingest.table.hint}</span>
      </div>
      <Button
        variant="primary"
        loading={isPending}
        disabled={rowCount === 0 || isPending}
        onClick={onSubmit}
      >
        {ru.ingest.table.submit(rowCount, plural(rowCount, ru.ingest.rowFormsAccusative))}
      </Button>
    </div>
  );
}
