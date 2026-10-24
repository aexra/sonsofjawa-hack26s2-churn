import { useState } from 'react';

import {
  notifyUploaded,
  reportUploadError,
  useReplaceSnapshot,
  type UploadFailure,
} from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';

import type { SnapshotSource } from './use-snapshot-source';

export function useSnapshotReplace(source: SnapshotSource) {
  const { mutate, isPending } = useReplaceSnapshot();
  const [failure, setFailure] = useState<UploadFailure | null>(null);

  const replace = () => {
    const { payload } = source;
    if (!payload) return;
    setFailure(null);
    mutate(payload, {
      onSuccess: (result) => {
        notifyUploaded(result, ru.ingest.snapshot.label);
        source.reset();
      },
      onError: (error) => setFailure(reportUploadError(error)),
    });
  };

  return { replace, isPending, failure, resetFailure: () => setFailure(null) };
}
