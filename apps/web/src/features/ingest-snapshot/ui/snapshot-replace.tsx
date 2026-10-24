import { useState } from 'react';

import { INGEST_ENTITIES, UploadFailureAlert, type IngestEntity } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';
import { formatFileSize } from '@/shared/lib/file-size';
import { formatInt } from '@/shared/lib/format';
import { plural } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';
import { FileCard, FileDrop } from '@/shared/ui/file-drop';

import { useSnapshotReplace } from '../model/use-snapshot-replace';
import { useSnapshotSource } from '../model/use-snapshot-source';

import { SnapshotConfirm } from './snapshot-confirm';

import type { SnapshotProblem } from '../model/snapshot-files';

const problemText = (problem: SnapshotProblem): string => {
  switch (problem.kind) {
    case 'invalid-json':
      return ru.ingest.snapshot.invalidJson(problem.name);
    case 'unknown-name':
      return ru.ingest.snapshot.unknownName(problem.name);
    case 'mixed':
      return ru.ingest.snapshot.mixed;
  }
};

const rowsMeta = (rows: number): string => `${formatInt(rows)} ${plural(rows, ru.ingest.rowForms)}`;

export function SnapshotReplace() {
  const source = useSnapshotSource();
  const { replace, isPending, failure, resetFailure } = useSnapshotReplace(source);
  const [confirming, setConfirming] = useState(false);

  const pick = (files: File[]) => {
    resetFailure();
    void source.pick(files);
  };

  const missing = INGEST_ENTITIES.filter((entity: IngestEntity) => !source.csv[entity]);
  const hasCsv = INGEST_ENTITIES.some((entity) => source.csv[entity]);

  return (
    <div className="flex flex-col gap-3">
      <FileDrop
        accept=".json,.csv,application/json,text/csv"
        multiple
        title={ru.ingest.snapshot.dropTitle}
        hint={ru.ingest.snapshot.dropHint}
        onFiles={pick}
      />
      {source.problem && (
        <p role="alert" className="m-0 text-negative">
          {problemText(source.problem)}
        </p>
      )}
      {source.json && (
        <FileCard
          name={source.json.name}
          meta={ru.ingest.snapshot.jsonMeta(
            formatInt(source.json.counts.accounts),
            formatInt(source.json.counts.services),
            formatInt(source.json.counts.transactions),
            formatFileSize(source.json.size, ru.ingest.fileSize),
          )}
          clearLabel={ru.ingest.csv.clear}
          onClear={source.removeJson}
        />
      )}
      {INGEST_ENTITIES.map((entity) => {
        const part = source.csv[entity];
        return part ? (
          <FileCard
            key={entity}
            name={part.file.name}
            meta={`${ru.ingest.entities[entity]} · ${rowsMeta(part.rows)}`}
            clearLabel={ru.ingest.csv.clear}
            onClear={() => source.removeCsv(entity)}
          />
        ) : null;
      })}
      {hasCsv && missing.length > 0 && (
        <p className="m-0 text-caption text-ink-muted">
          {ru.ingest.snapshot.missingFiles(missing.map((entity) => `${entity}.csv`).join(', '))}
        </p>
      )}
      {failure && <UploadFailureAlert failure={failure} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-caption text-ink-muted">{ru.ingest.snapshot.hint}</span>
        <Button
          variant="danger"
          disabled={!source.ready || isPending}
          loading={isPending}
          onClick={() => setConfirming(true)}
        >
          {ru.ingest.snapshot.replace}
        </Button>
      </div>
      <SnapshotConfirm
        open={confirming}
        onOpenChange={setConfirming}
        sourceName={source.json?.name ?? ru.ingest.snapshot.threeFiles}
        incoming={source.counts}
        onConfirm={replace}
      />
    </div>
  );
}
