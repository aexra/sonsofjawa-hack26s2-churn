import { useCallback, useState } from 'react';

import { loadMcpKey, saveMcpKey } from './storage';

const KEY_PATTERN = /^ck_[a-z0-9]{8}_[0-9A-Za-z]{32}$/;

const isMcpKeyWellFormed = (key: string): boolean => KEY_PATTERN.test(key);

export function useMcpKey() {
  const [key, setKeyState] = useState(loadMcpKey);

  const setKey = useCallback((value: string) => {
    const next = value.trim();
    setKeyState(next);
    saveMcpKey(next);
  }, []);

  const forget = useCallback(() => {
    setKeyState('');
    saveMcpKey('');
  }, []);

  return { key, setKey, forget, wellFormed: key === '' || isMcpKeyWellFormed(key) };
}
