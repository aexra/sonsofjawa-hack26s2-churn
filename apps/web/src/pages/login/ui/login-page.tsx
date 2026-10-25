import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { useSession } from '@/entities/session';
import { LoginForm, SsoButton, useAuthProviders } from '@/features/auth-login';
import { runtimeConfig } from '@/shared/config/runtime';
import { ru } from '@/shared/i18n/ru';
import { isServerPath, safeNextPath } from '@/shared/lib/redirect';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { BrandPanel } from './brand-panel';

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

function ServerRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}

export function LoginPage() {
  const [params] = useSearchParams();
  const { user } = useSession();
  const providers = useAuthProviders();
  const next = safeNextPath(params.get('next'));
  const rememberedNext = params.has('next') ? next : null;
  const ssoError = SSO_ERRORS[params.get('error') ?? ''];
  const expired = params.get('expired') === '1';

  useEffect(() => {
    document.title = `${ru.pages.login} · ${ru.app.title}`;
  }, []);

  if (user)
    return isServerPath(next) ? <ServerRedirect to={next} /> : <Navigate to={next} replace />;

  const oidc = providers.data?.oidc;
  const sso =
    oidc?.enabled && oidc.loginUrl ? { loginUrl: oidc.loginUrl, name: oidc.displayName } : null;
  const localEnabled = providers.data?.local.enabled === true;
  const forbidden = params.get('error') === 'forbidden';
  const ssoLabel = sso?.name ?? ru.login.ssoName;

  return (
    <div className="box-border flex min-h-screen flex-col bg-canvas md:flex-row">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-100 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-display text-title text-[34px] leading-10">{ru.login.title}</h1>
            <p className="m-0 text-ink-muted">{ru.login.footnote}</p>
          </div>
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
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          )}
          {forbidden && sso && (
            <p className="m-0 text-ink-muted">{ru.login.forbiddenHint(ssoLabel)}</p>
          )}
          {localEnabled && <LoginForm />}
          {localEnabled && sso && (
            <div aria-hidden="true" className="flex items-center gap-3 text-caption text-ink-muted">
              <span className="h-px flex-1 bg-line" />
              {ru.login.or}
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          {providers.isError && (
            <EmptyState
              kind="error"
              title={ru.common.loadFailed}
              text={ru.common.loadFailedText}
              action={<Button onClick={() => void providers.refetch()}>{ru.common.retry}</Button>}
            />
          )}
          {providers.data?.local.enabled === false && !(forbidden && sso) && (
            <p className="m-0 text-ink-muted">{ru.login.localDisabled}</p>
          )}
          {sso && (
            <div className="flex flex-col gap-2">
              <SsoButton
                loginUrl={sso.loginUrl}
                displayName={sso.name}
                next={rememberedNext}
                primary={!localEnabled && !forbidden}
              />
              {runtimeConfig.demoUser && (
                <p className="m-0 text-center text-caption text-ink-muted">
                  {ru.login.demoUser(runtimeConfig.demoUser)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
