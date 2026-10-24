import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { takeNextTarget } from './next-target';

export function useResumeAfterSso(): void {
  const navigate = useNavigate();
  const landedOnRoot = useRef(useLocation().pathname === '/');

  useEffect(() => {
    const target = takeNextTarget();
    if (landedOnRoot.current && target !== null && target !== '/') {
      void navigate(target, { replace: true });
    }
  }, [navigate]);
}
