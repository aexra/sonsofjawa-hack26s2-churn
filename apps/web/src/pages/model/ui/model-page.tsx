import { useModelSettings } from '@/entities/model-settings';
import { useSession } from '@/entities/session';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { RevisionsTable } from '@/widgets/model-revisions';
import { SettingsForm } from '@/widgets/settings-form';

export function ModelPage() {
  const { isAdmin } = useSession();
  const { data, isPending, isError, refetch } = useModelSettings();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        kind="error"
        title={ru.model.loadFailed}
        text={ru.common.loadFailedText}
        action={<Button onClick={() => void refetch()}>{ru.common.retry}</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <SettingsForm settings={data} canEdit={isAdmin} />
      <RevisionsTable settings={data} />
    </div>
  );
}
