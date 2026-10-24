import { toast } from 'sonner';

import { INGEST_ENTITIES, type IngestEntity } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';

import { rowsFromClipboard } from '../model/clipboard';
import { useLoadByIds } from '../model/use-load-by-ids';

import type { TableDraft } from '../model/use-table-draft';

interface TableToolbarProps {
  entity: IngestEntity;
  onEntityChange: (entity: IngestEntity) => void;
  draft: TableDraft;
}

const isEntity = (value: string): value is IngestEntity =>
  INGEST_ENTITIES.some((entity) => entity === value);

export function TableToolbar({ entity, onEntityChange, draft }: TableToolbarProps) {
  const ids = useLoadByIds(entity, draft);

  const paste = async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error(ru.ingest.table.clipboardDenied);
      return;
    }
    const result = rowsFromClipboard(entity, text);
    if ('rows' in result) draft.append(result.rows);
    else if ('tooWide' in result) toast.error(ru.ingest.table.pasteTooWide);
    else toast.error(ru.ingest.table.pasteEmpty);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-50 max-w-full">
        <Field label={ru.ingest.entityLabel} id="ingest-entity">
          <Select
            id="ingest-entity"
            value={entity}
            onValueChange={(value) => {
              if (isEntity(value)) onEntityChange(value);
            }}
            options={INGEST_ENTITIES.map((item) => ({
              value: item,
              label: ru.ingest.entities[item],
            }))}
          />
        </Field>
      </div>
      <div className="min-w-55 max-w-80 flex-[1_1_220px]">
        <Field
          label={ru.ingest.table.idsLabel}
          id="ingest-ids"
          error={ids.invalid ? ru.ingest.table.idsInvalid : undefined}
        >
          <Input
            id="ingest-ids"
            mono
            value={ids.text}
            invalid={ids.invalid}
            placeholder={ru.ingest.table.idsPlaceholder}
            onChange={(event) => ids.setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') ids.load();
            }}
          />
        </Field>
      </div>
      <Button size="sm" loading={ids.isPending} onClick={ids.load}>
        {ru.ingest.table.load}
      </Button>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => void paste()}>
          {ru.ingest.table.paste}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={draft.selected.size === 0}
          onClick={draft.removeSelected}
        >
          {ru.ingest.table.removeRow}
        </Button>
        <Button size="sm" onClick={draft.addRow}>
          {ru.ingest.table.addRow}
        </Button>
      </div>
    </div>
  );
}
