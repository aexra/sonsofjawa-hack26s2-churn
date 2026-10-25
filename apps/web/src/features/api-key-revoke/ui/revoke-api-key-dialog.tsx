import { toast } from 'sonner';

import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { AlertDialog } from '@/shared/ui/alert-dialog';

import { useRevokeApiKey } from '../model/use-revoke-api-key';

import type { ApiKey } from '@/entities/api-key';

interface RevokeApiKeyDialogProps {
  apiKey: ApiKey | null;
  onClose: () => void;
}

export function RevokeApiKeyDialog({ apiKey, onClose }: RevokeApiKeyDialogProps) {
  const { mutate } = useRevokeApiKey();
  const confirm = () => {
    if (!apiKey) return;
    mutate(apiKey.id, {
      onSuccess: () => toast.success(ru.access.keys.revoked),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };
  return (
    <AlertDialog
      open={apiKey !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={ru.access.keys.revokeTitle(apiKey?.name ?? '')}
      confirmLabel={ru.access.keys.revokeConfirm}
      cancelLabel={ru.access.cancel}
      onConfirm={confirm}
    >
      {ru.access.keys.revokeText}
    </AlertDialog>
  );
}
