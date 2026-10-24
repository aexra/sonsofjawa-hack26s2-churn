import { useEffect, useEffectEvent, useState } from 'react';

export function useDebouncedField(external: string, commit: (value: string) => void, delay = 300) {
  const [local, setLocal] = useState(external);
  const [committed, setCommitted] = useState(external);
  const [seen, setSeen] = useState(external);
  const emit = useEffectEvent(commit);

  if (external !== seen) {
    setSeen(external);
    if (external !== committed) {
      setCommitted(external);
      setLocal(external);
    }
  }

  useEffect(() => {
    if (local === committed) return;
    const timer = setTimeout(() => {
      setCommitted(local);
      emit(local);
    }, delay);
    return () => clearTimeout(timer);
  }, [local, committed, delay]);

  return [local, setLocal] as const;
}
