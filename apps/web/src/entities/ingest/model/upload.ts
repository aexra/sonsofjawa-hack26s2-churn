import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiClient, unwrap } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

import type { IngestEntity } from './fields';
import type { components } from '@/shared/api/schema';

export type IngestResult = components['schemas']['IngestResult'];

type UploadPayload =
  { format: 'json'; rows: Record<string, unknown>[] } | { format: 'csv'; text: string };

export type SnapshotPayload =
  { format: 'json'; body: unknown } | { format: 'csv'; files: Record<IngestEntity, File> };

const csvRequest = (text: string) => ({
  body: text as never,
  bodySerializer: (body: unknown) => body as string,
  headers: { 'Content-Type': 'text/csv' },
});

const multipart = (files: Record<IngestEntity, File>): FormData => {
  const form = new FormData();
  for (const [entity, file] of Object.entries(files)) form.append(entity, file);
  return form;
};

const uploadSource = (entity: IngestEntity, payload: UploadPayload): Promise<IngestResult> => {
  const options =
    payload.format === 'csv' ? csvRequest(payload.text) : { body: payload.rows as never };
  switch (entity) {
    case 'accounts':
      return unwrap(apiClient.POST('/api/v1/source/accounts', options));
    case 'services':
      return unwrap(apiClient.POST('/api/v1/source/services', options));
    case 'transactions':
      return unwrap(apiClient.POST('/api/v1/source/transactions', options));
  }
};

const replaceSnapshot = (payload: SnapshotPayload): Promise<IngestResult> =>
  unwrap(
    apiClient.PUT(
      '/api/v1/source/snapshot',
      payload.format === 'json'
        ? { body: payload.body as never }
        : { body: payload.files as never, bodySerializer: () => multipart(payload.files) },
    ),
  );

const refreshAfterIngest = (queryClient: QueryClient): void => {
  for (const queryKey of [queryKeys.ingestLog, queryKeys.recalcStatus, queryKeys.source]) {
    void queryClient.invalidateQueries({ queryKey });
  }
};

export function useUploadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entity, payload }: { entity: IngestEntity; payload: UploadPayload }) =>
      uploadSource(entity, payload),
    onSettled: () => refreshAfterIngest(queryClient),
  });
}

export function useReplaceSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: replaceSnapshot,
    onSettled: () => refreshAfterIngest(queryClient),
  });
}
