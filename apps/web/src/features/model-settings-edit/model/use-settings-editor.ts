import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ApiError } from '@/shared/api/api-error';
import { errorMessage } from '@/shared/api/error-message';
import { queryKeys } from '@/shared/api/query-keys';
import { ru } from '@/shared/i18n/ru';

import {
  buildSchema,
  defaultsDraft,
  diffDraft,
  toDraft,
  toPatch,
  WEIGHTS_SUM_KEY,
  type DraftValues,
} from './draft';
import { useUpdateModelSettings } from './use-update-model-settings';

import type { ModelSettings } from './settings';

const FIELD_PREFIX = 'values.';

export function useSettingsEditor(settings: ModelSettings) {
  const [baseline, setBaseline] = useState(settings);
  const queryClient = useQueryClient();
  const saved = useMemo(() => toDraft(baseline), [baseline]);
  const schema = useMemo(() => buildSchema(baseline), [baseline]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const update = useUpdateModelSettings();

  const form = useForm<DraftValues>({
    resolver: zodResolver(schema),
    defaultValues: saved,
    mode: 'onChange',
  });
  const { reset, setValue, getValues, setError, trigger, control, formState } = form;
  const draft = useWatch({ control }) as DraftValues;
  const changes = useMemo(() => diffDraft(saved, draft), [saved, draft]);
  const dirty = changes.count > 0;

  useEffect(() => {
    void trigger();
  }, [draft, trigger]);

  const stale = settings.modelVersion > baseline.modelVersion;
  if (stale && !dirty) setBaseline(settings);

  useEffect(() => {
    reset(toDraft(baseline));
  }, [baseline, reset]);

  const revert = useCallback(() => {
    reset(saved);
    setServerMessage(null);
  }, [reset, saved]);

  const resetDefaults = useCallback(() => {
    const next = defaultsDraft(baseline, getValues());
    for (const [key, value] of Object.entries(next.values)) {
      setValue(`values.${key}`, value, { shouldValidate: true });
    }
  }, [baseline, getValues, setValue]);

  const showServerErrors = useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.errors.length === 0) {
        setServerMessage(errorMessage(error));
        return;
      }
      let unmapped = false;
      for (const fieldError of error.errors) {
        const text = ru.model.serverFieldErrors[fieldError.code] ?? ru.errors.validation_failed;
        if (fieldError.field?.startsWith(FIELD_PREFIX)) {
          setError(fieldError.field as `values.${string}`, { type: 'server', message: text });
        } else if (fieldError.field === 'values') {
          setError(`values.${WEIGHTS_SUM_KEY}`, { type: 'server', message: text });
        } else if (fieldError.field === 'clock.asOf') {
          setError('clock.asOf', { type: 'server', message: text });
        } else {
          unmapped = true;
        }
      }
      setServerMessage(unmapped ? ru.errors.validation_failed : null);
    },
    [setError],
  );

  const save = form.handleSubmit((data) => {
    setServerMessage(null);
    update.mutate(toPatch(diffDraft(saved, data), data), {
      onSuccess: (updated) => {
        setBaseline(updated);
        queryClient.setQueryData(queryKeys.modelSettings, updated);
        toast.success(ru.model.saved(updated.modelVersion));
      },
      onError: showServerErrors,
    });
  });

  return {
    form,
    baseline,
    saved,
    draft,
    changes,
    dirty,
    valid: formState.isValid,
    saving: update.isPending,
    save,
    revert,
    resetDefaults,
    serverMessage,
    externalChange: stale && dirty,
    refresh: () => {
      setBaseline(settings);
    },
    weightsError: formState.errors.values?.[WEIGHTS_SUM_KEY]?.message,
  };
}
