import { ru } from '@/shared/i18n/ru';
import { cn } from '@/shared/lib/cn';
import { buttonVariants } from '@/shared/ui/button';

import { rememberNextTarget } from '../model/next-target';

interface SsoButtonProps {
  loginUrl: string;
  displayName: string | undefined;
  next: string | null;
  primary: boolean;
}

export function SsoButton({ loginUrl, displayName, next, primary }: SsoButtonProps) {
  return (
    <a
      href={loginUrl}
      onClick={() => {
        if (next !== null) rememberNextTarget(next);
      }}
      className={cn(buttonVariants({ variant: primary ? 'primary' : 'secondary' }), 'h-11 w-full')}
    >
      {ru.login.ssoSubmit(displayName ?? ru.login.ssoName)}
    </a>
  );
}
