import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { isServerPath } from '@/shared/lib/redirect';

import { takeNextTarget } from './next-target';

export function useResumeAfterSso(): void {
  const navigate = useNavigate();
  const landedOnRoot = useRef(useLocation().pathname === '/');

  useEffect(() => {
    const target = takeNextTarget();
    if (!landedOnRoot.current || target === null || target === '/') return;
    if (isServerPath(target)) {
      window.location.replace(target);
    } else {
      void navigate(target, { replace: true });
    }
  }, [navigate]);
}
