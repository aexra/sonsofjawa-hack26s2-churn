import { useMemo } from 'react';

import { computePreview, type Preview } from './compute';
import { usePreviewCustomers } from './use-preview-customers';

import type { components } from '@/shared/api/schema';

export type PreviewState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'too-many' }
  | { kind: 'invalid' }
  | { kind: 'ready'; preview: Preview };

export const useModelPreview = (
  settings: components['schemas']['ModelSettings'],
  draft: Record<string, number>,
  enabled: boolean,
): PreviewState => {
  const { data, isError } = usePreviewCustomers(enabled);
  return useMemo((): PreviewState => {
    if (isError) return { kind: 'error' };
    if (!data) return { kind: 'loading' };
    if (data.tooMany) return { kind: 'too-many' };
    const preview = computePreview(data.customers, settings, draft);
    return preview ? { kind: 'ready', preview } : { kind: 'invalid' };
  }, [data, isError, settings, draft]);
};
