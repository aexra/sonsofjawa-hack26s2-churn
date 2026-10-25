import { UploadFailureAlert, type IngestEntity } from '@/entities/ingest';
import {
  SubmitBar,
  TableToolbar,
  useSubmitRows,
  useTableDraft,
} from '@/features/ingest-json-table';

import { EditableTable } from './editable-table';

interface IngestTableEditorProps {
  entity: IngestEntity;
  onEntityChange: (entity: IngestEntity) => void;
}

export function IngestTableEditor({ entity, onEntityChange }: IngestTableEditorProps) {
  const draft = useTableDraft(entity);
  const { submit, isPending, failure } = useSubmitRows(entity, draft);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TableToolbar entity={entity} onEntityChange={onEntityChange} draft={draft} />
      <EditableTable entity={entity} draft={draft} />
      {failure && <UploadFailureAlert failure={failure} />}
      <SubmitBar
        rowCount={draft.rows.length}
        issueCount={draft.issueCount}
        revealed={draft.revealed}
        isPending={isPending}
        onSubmit={submit}
      />
    </div>
  );
}
