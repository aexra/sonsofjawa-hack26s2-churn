import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ROLES, type User } from '@/entities/user';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Tooltip } from '@/shared/ui/tooltip';

import { useUpdateUser } from '../model/use-user-mutations';

import type { components } from '@/shared/api/schema';

const FORM_ID = 'edit-user-form';

const schema = z.object({
  role: z.enum(['admin', 'user']),
  displayName: z.string().max(200),
  email: z.union([z.literal(''), z.email(ru.access.users.emailInvalid)]),
  password: z.union([z.literal(''), z.string().min(8, ru.access.users.passwordInvalid).max(200)]),
});

type FormValues = z.infer<typeof schema>;

const valuesOf = (user: User): FormValues => ({
  role: user.role,
  displayName: user.displayName ?? '',
  email: user.email ?? '',
  password: '',
});

function EditForm({ user, onClose }: { user: User; onClose: () => void }) {
  const { mutate, isPending, error } = useUpdateUser();
  const sso = user.authProvider === 'oidc';
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesOf(user) });

  const submit = (values: FormValues) => {
    const initial = valuesOf(user);
    const patch: components['schemas']['UserPatch'] = {};
    if (!sso && values.role !== initial.role) patch.role = values.role;
    if (values.displayName !== initial.displayName) patch.displayName = values.displayName;
    if (values.email !== initial.email) patch.email = values.email;
    if (!sso && values.password) patch.password = values.password;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    mutate(
      { id: user.id, patch },
      {
        onSuccess: () => {
          toast.success(ru.access.users.saved);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={ru.access.users.editTitle(user.login)}
      actions={
        <>
          <Button onClick={onClose}>{ru.access.cancel}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={isPending}>
            {isPending ? ru.access.saving : ru.access.save}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
        className="flex flex-col gap-4"
      >
        <Field label={ru.access.users.role} id="edit-role">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  id="edit-role"
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={sso}
                  options={ROLES.map((role) => ({ value: role, label: ru.roles[role] }))}
                />
              )}
            />
            {sso && (
              <Tooltip content={ru.access.users.roleManagedByProvider}>
                <button
                  type="button"
                  aria-label={ru.access.users.roleManagedByProvider}
                  className="inline-flex cursor-help rounded-xs text-ink-muted"
                >
                  <Info aria-hidden="true" className="size-4" />
                </button>
              </Tooltip>
            )}
          </div>
        </Field>
        <Field label={ru.access.users.displayName} id="edit-display-name">
          <Input id="edit-display-name" autoComplete="off" {...register('displayName')} />
        </Field>
        <Field label={ru.access.users.email} id="edit-email" error={errors.email?.message}>
          <Input
            id="edit-email"
            type="email"
            autoComplete="off"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>
        {!sso && (
          <Field
            label={ru.access.users.newPassword}
            id="edit-password"
            hint={ru.access.users.newPasswordHint}
            error={errors.password?.message}
          >
            <Input
              id="edit-password"
              type="password"
              autoComplete="new-password"
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </Field>
        )}
        {error && (
          <div role="alert" className="rounded-sm bg-risk-high-soft px-3 py-2.5 text-risk-high">
            {errorMessage(error)}
          </div>
        )}
      </form>
    </Dialog>
  );
}

interface EditUserDialogProps {
  user: User | null;
  onClose: () => void;
}

export function EditUserDialog({ user, onClose }: EditUserDialogProps) {
  return user ? <EditForm key={user.id} user={user} onClose={onClose} /> : null;
}
