import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { fieldKeys, UploadFailureAlert, type IngestEntity } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';
import { formatFileSize } from '@/shared/lib/file-size';
import { plural } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { FileCard, FileDrop } from '@/shared/ui/file-drop';

import { previewCsv, PREVIEW_ROWS } from '../model/preview';
import { useCsvUpload } from '../model/use-csv-upload';

interface PickedFile {
  name: string;
  size: number;
  text: string;
}

export function CsvUploader({ entity }: { entity: IngestEntity }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const { upload, isPending, failure, resetFailure } = useCsvUpload(entity, () => setFile(null));
  const preview = useMemo(() => (file ? previewCsv(file.text, entity) : null), [file, entity]);

  const pick = async ([picked]: File[]) => {
    if (!picked) return;
    resetFailure();
    setFile({ name: picked.name, size: picked.size, text: await picked.text() });
  };

  const clear = () => {
    resetFailure();
    setFile(null);
  };

  if (!file || !preview) {
    return (
      <FileDrop
        accept=".csv,text/csv"
        title={ru.ingest.csv.dropTitle}
        hint={ru.ingest.csv.dropHint}
        onFiles={(files) => void pick(files)}
      />
    );
  }

  const columnCount = fieldKeys(entity).length;
  const canUpload = preview.issues.length === 0 && preview.totalRows > 0;
  const shown = Math.min(PREVIEW_ROWS, preview.totalRows);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FileCard
        name={file.name}
        meta={ru.ingest.csv.fileMeta(
          preview.totalRows,
          plural(preview.totalRows, ru.ingest.rowForms),
          preview.columns.length,
          plural(preview.columns.length, ru.ingest.columnForms),
          formatFileSize(file.size, ru.ingest.fileSize),
        )}
        clearLabel={ru.ingest.csv.clear}
        onClear={clear}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-heading">
          {ru.ingest.csv.previewTitle(
            shown,
            preview.totalRows,
            plural(preview.totalRows, ru.ingest.rowFormsGenitive),
          )}
        </h2>
        <span className="text-caption text-ink-muted">
          {ru.ingest.csv.found(
            preview.columns.length,
            plural(preview.columns.length, ru.ingest.columnForms),
            columnCount,
            ru.ingest.csv.delimiterName(preview.delimiter),
          )}
        </span>
      </div>
      {preview.issues.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-1 rounded-md border border-negative bg-risk-high-soft px-4 py-3 text-negative"
        >
          {preview.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}
      <DataTable
        caption={ru.ingest.csv.previewCaption(file.name)}
        columns={preview.columns.map((column, index) => ({
          key: `column-${String(index)}`,
          label: column,
          mono: true,
          render: (row: { cells: string[] }) => row.cells[index],
        }))}
        rows={preview.rows.map((cells, index) => ({ index, cells }))}
        rowKey={(row) => String(row.index)}
      />
      {failure && <UploadFailureAlert failure={failure} />}
      <div className="flex justify-end gap-2">
        <Button onClick={clear}>{ru.ingest.csv.cancel}</Button>
        <Button
          variant="primary"
          loading={isPending}
          disabled={!canUpload || isPending}
          onClick={() => upload(file.text)}
        >
          {ru.ingest.csv.submit(
            preview.totalRows,
            plural(preview.totalRows, ru.ingest.rowFormsAccusative),
          )}
        </Button>
      </div>
    </div>
  );
}
