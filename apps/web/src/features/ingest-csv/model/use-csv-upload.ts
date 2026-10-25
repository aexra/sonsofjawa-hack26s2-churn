import { useState } from 'react';

import {
  notifyUploaded,
  reportUploadError,
  useUploadSource,
  type IngestEntity,
  type UploadFailure,
} from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';

export function useCsvUpload(entity: IngestEntity, onUploaded: () => void) {
  const { mutate, isPending } = useUploadSource();
  const [failure, setFailure] = useState<UploadFailure | null>(null);

  const upload = (text: string) => {
    setFailure(null);
    mutate(
      { entity, payload: { format: 'csv', text } },
      {
        onSuccess: (result) => {
          notifyUploaded(result, ru.ingest.entities[entity]);
          onUploaded();
        },
        onError: (error) => setFailure(reportUploadError(error)),
      },
    );
  };

  return { upload, isPending, failure, resetFailure: () => setFailure(null) };
}
