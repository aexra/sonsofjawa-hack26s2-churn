import { useCallback, useState } from 'react';
import { z } from 'zod';

import { DEFAULT_FIELDS, type CustomerField } from '@/entities/customer';

const STORAGE_KEY = 'customers.columns';

const stored = z.array(z.string()).min(1);

const load = (): CustomerField[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = stored.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data as CustomerField[];
    }
  } catch {
    return [...DEFAULT_FIELDS];
  }
  return [...DEFAULT_FIELDS];
};

const save = (fields: CustomerField[] | null) => {
  try {
    if (fields === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  } catch {
    return;
  }
};

export function useCustomerColumns() {
  const [fields, setFields] = useState(load);
  const change = useCallback((next: CustomerField[]) => {
    setFields(next);
    save(next);
  }, []);
  const reset = useCallback(() => {
    setFields([...DEFAULT_FIELDS]);
    save(null);
  }, []);
  return { fields, change, reset };
}
