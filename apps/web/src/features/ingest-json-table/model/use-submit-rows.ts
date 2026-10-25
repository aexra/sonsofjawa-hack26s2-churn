import { useState } from 'react';

import {
  notifyUploaded,
  reportUploadError,
  toPayload,
  useUploadSource,
  type IngestEntity,
  type UploadFailure,
} from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';

import { describeFieldError } from './describe-field-error';

import type { TableDraft } from './use-table-draft';

interface Tagged {
  entity: IngestEntity;
  failure: UploadFailure;
}

export function useSubmitRows(entity: IngestEntity, draft: TableDraft) {
  const { mutate, isPending } = useUploadSource();
  const [tagged, setTagged] = useState<Tagged | null>(null);
  const failure = tagged?.entity === entity ? tagged.failure : null;

  const submit = () => {
    if (draft.issueCount > 0) {
      draft.reveal();
      return;
    }
    const rows = draft.rows;
    setTagged(null);
    draft.setServerErrors({});
    mutate(
      {
        entity,
        payload: { format: 'json', rows: rows.map((row) => toPayload(entity, row.values)) },
      },
      {
        onSuccess: (result) => {
          notifyUploaded(result, ru.ingest.entities[entity]);
          draft.clear();
        },
        onError: (error) => {
          const reported = reportUploadError(error);
          if (!reported) return;
          setTagged({ entity, failure: reported });
          if (reported.kind === 'rejected') {
            draft.setServerErrors(describeFieldError(rows, reported.errors));
          }
        },
      },
    );
  };

  return { submit, isPending, failure };
}
