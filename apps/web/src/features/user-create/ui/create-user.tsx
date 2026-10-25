import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ROLES } from '@/entities/user';
import { ApiError } from '@/shared/api/api-error';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';

import { useCreateUser } from '../model/use-create-user';

const FORM_ID = 'create-user-form';

const schema = z.object({
  login: z.string().regex(/^[a-z0-9._-]{3,64}$/, ru.access.users.loginInvalid),
  password: z.string().min(8, ru.access.users.passwordInvalid).max(200),
  role: z.enum(['admin', 'user']),
  email: z.union([z.literal(''), z.email(ru.access.users.emailInvalid)]),
  displayName: z.string().max(200),
});

type FormValues = z.infer<typeof schema>;

const defaults: FormValues = { login: '', password: '', role: 'user', email: '', displayName: '' };

export function CreateUser() {
  const [open, setOpen] = useState(false);
  const { mutate, isPending, error, reset: resetMutation } = useCreateUser();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const close = () => {
    setOpen(false);
    reset(defaults);
    resetMutation();
  };

  const submit = (values: FormValues) => {
    mutate(
      {
        login: values.login,
        password: values.password,
        role: values.role,
        ...(values.email && { email: values.email }),
        ...(values.displayName && { displayName: values.displayName }),
      },
      {
        onSuccess: () => {
          close();
          toast.success(ru.access.users.created);
        },
      },
    );
  };

  const taken = error instanceof ApiError && error.code === 'conflict';

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {ru.access.users.create}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={ru.access.users.createTitle}
        actions={
          <>
            <Button onClick={close}>{ru.access.cancel}</Button>
            <Button type="submit" form={FORM_ID} variant="primary" loading={isPending}>
              {isPending ? ru.access.users.submitting : ru.access.users.submit}
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
          <Field
            label={ru.access.users.login}
            id="user-login"
            hint={ru.access.users.loginHint}
            error={errors.login?.message ?? (taken ? ru.access.users.loginTaken : undefined)}
          >
            <Input
              id="user-login"
              mono
              autoComplete="off"
              invalid={Boolean(errors.login) || taken}
              {...register('login')}
            />
          </Field>
          <Field
            label={ru.access.users.password}
            id="user-password"
            hint={ru.access.users.passwordHint}
            error={errors.password?.message}
          >
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          </Field>
          <Field label={ru.access.users.role} id="user-role">
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  id="user-role"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ROLES.map((role) => ({ value: role, label: ru.roles[role] }))}
                />
              )}
            />
          </Field>
          <Field label={ru.access.users.email} id="user-email" error={errors.email?.message}>
            <Input
              id="user-email"
              type="email"
              autoComplete="off"
              invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </Field>
          <Field label={ru.access.users.displayName} id="user-display-name">
            <Input id="user-display-name" autoComplete="off" {...register('displayName')} />
          </Field>
          {error && !taken && (
            <div role="alert" className="rounded-sm bg-risk-high-soft px-3 py-2.5 text-risk-high">
              {errorMessage(error)}
            </div>
          )}
        </form>
      </Dialog>
    </>
  );
}
