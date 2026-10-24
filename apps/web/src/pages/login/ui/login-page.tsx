import { CircleAlert, Info, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { useSession } from '@/entities/session';
import { LoginForm, useAuthProviders } from '@/features/auth-login';
import { ru } from '@/shared/i18n/ru';
import { safeNextPath } from '@/shared/lib/redirect';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

const SSO_ERRORS: Record<string, { icon: LucideIcon; text: string }> = {
  forbidden: { icon: TriangleAlert, text: ru.login.errors.forbidden },
  provider: { icon: CircleAlert, text: ru.login.errors.provider },
};

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'error' | 'info';
  icon: LucideIcon;
  children: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'flex items-start gap-2 rounded-sm bg-risk-high-soft px-3 py-2.5 text-risk-high'
          : 'flex items-start gap-2 rounded-sm bg-accent-soft px-3 py-2.5 text-ink'
      }
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <span>{children}</span>
    </div>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const { user } = useSession();
  const providers = useAuthProviders();
  const next = safeNextPath(params.get('next'));
  const ssoError = SSO_ERRORS[params.get('error') ?? ''];
  const expired = params.get('expired') === '1';

  useEffect(() => {
    document.title = `${ru.pages.login} · ${ru.app.title}`;
  }, []);

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="box-border flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="flex w-full max-w-100 flex-col gap-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-sm bg-accent text-on-accent"
          >
            <ShieldCheck className="size-4" />
          </span>
          <span className="font-display text-[20px] leading-7 font-semibold">{ru.app.title}</span>
        </div>
        <div className="flex flex-col gap-4 rounded-md border border-line bg-surface p-6">
          <h1 className="m-0 font-display text-title">{ru.login.title}</h1>
          {expired && (
            <Notice tone="info" icon={Info}>
              {ru.login.sessionExpired}
            </Notice>
          )}
          {ssoError && (
            <Notice tone="error" icon={ssoError.icon}>
              {ssoError.text}
            </Notice>
          )}
          {providers.isPending && (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-control-md" />
              <Skeleton className="h-control-md" />
              <Skeleton className="h-control-md" />
            </div>
          )}
          {providers.data?.local.enabled && <LoginForm />}
          {providers.isError && (
            <EmptyState
              kind="error"
              title={ru.common.loadFailed}
              text={ru.common.loadFailedText}
              action={<Button onClick={() => void providers.refetch()}>{ru.common.retry}</Button>}
            />
          )}
          {providers.data?.local.enabled === false && (
            <p className="m-0 text-ink-muted">{ru.login.localDisabled}</p>
          )}
        </div>
        <p className="m-0 text-center text-caption text-ink-muted">{ru.login.footnote}</p>
      </div>
    </div>
  );
}
