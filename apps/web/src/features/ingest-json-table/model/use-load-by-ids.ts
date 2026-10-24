import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { MAX_IDS, listSourceRows, type IngestEntity } from '@/entities/ingest';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';

import { rowFromValues } from './draft';

import type { TableDraft } from './use-table-draft';

const parseIds = (text: string): number[] | null => {
  const tokens = text.split(/[\s,;]+/).filter((token) => token !== '');
  if (tokens.length === 0 || tokens.length > MAX_IDS) return null;
  if (!tokens.every((token) => /^\d{1,15}$/.test(token))) return null;
  return [...new Set(tokens.map(Number))];
};

export function useLoadByIds(entity: IngestEntity, draft: TableDraft) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const { mutate, isPending } = useMutation({
    mutationFn: (ids: number[]) => listSourceRows(entity, ids, MAX_IDS),
  });

  const load = () => {
    const ids = parseIds(text);
    setInvalid(ids === null);
    if (ids === null) return;
    mutate(ids, {
      onSuccess: ({ items }) => {
        draft.merge(items.map((item) => rowFromValues(entity, item)));
        const found = new Set(items.map((item) => Number(item.id)));
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length > 0) toast.info(ru.ingest.table.notFound(missing.join(', ')));
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return {
    text,
    setText: (value: string) => {
      setText(value);
      setInvalid(false);
    },
    invalid,
    load,
    isPending,
  };
}
