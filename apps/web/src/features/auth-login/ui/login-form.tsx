import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import { useLogin } from '../model/use-login';

const schema = z.object({
  login: z.string().trim().min(1, ru.login.loginRequired),
  password: z.string().min(1, ru.login.passwordRequired),
});

type LoginValues = z.infer<typeof schema>;

export function LoginForm() {
  const { mutate, isPending, error } = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(schema) });

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit((values) => mutate(values))(event)}
      className="flex flex-col gap-4"
    >
      <Field label={ru.login.login} id="login" error={errors.login?.message}>
        <Input
          id="login"
          autoComplete="username"
          invalid={Boolean(errors.login) || Boolean(error)}
          disabled={isPending}
          aria-describedby={errors.login ? 'login-message' : undefined}
          {...register('login')}
        />
      </Field>
      <Field label={ru.login.password} id="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errors.password) || Boolean(error)}
          disabled={isPending}
          aria-describedby={errors.password ? 'password-message' : undefined}
          {...register('password')}
        />
      </Field>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-sm bg-risk-high-soft px-3 py-2.5 text-risk-high"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
          <span>{errorMessage(error)}</span>
        </div>
      )}
      <Button type="submit" variant="primary" loading={isPending} className="w-full">
        {isPending ? ru.login.submitting : ru.login.submit}
      </Button>
    </form>
  );
}
