import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { API_KEY_SCOPES, type ApiKeyScope } from '@/entities/api-key';
import { errorMessage } from '@/shared/api/error-message';
import { ru } from '@/shared/i18n/ru';
import { endOfDay } from '@/shared/lib/date';
import { formatDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog } from '@/shared/ui/dialog';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import { useCreateApiKey } from '../model/use-create-api-key';

import type { components } from '@/shared/api/schema';

const FORM_ID = 'create-api-key-form';

const schema = z.object({
  name: z.string().trim().min(1, ru.access.keys.nameRequired).max(100),
  scopes: z.array(z.enum(['read', 'ingest', 'metrics'])).min(1, ru.access.keys.scopesRequired),
  expiresAt: z
    .string()
    .refine((value) => value === '' || endOfDay(value) > new Date(), ru.access.keys.expiresInPast),
});

type FormValues = z.infer<typeof schema>;

type IssuedKey = components['schemas']['ApiKeyCreated'];

function IssuedKeyDialog({ issued, onClose }: { issued: IssuedKey; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.secret);
      toast.success(ru.access.keys.copied);
    } catch {
      toast.error(ru.access.keys.copyFailed);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={() => undefined}
      title={ru.access.keys.issuedTitle(issued.key.name)}
      actions={
        <Button variant="primary" onClick={onClose}>
          {ru.access.keys.saved}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="issued-key" className="text-label text-ink-muted">
            {ru.access.keys.key}
          </label>
          <div className="flex gap-2">
            <Input
              id="issued-key"
              mono
              readOnly
              value={issued.secret}
              className="min-w-0 flex-auto"
            />
            <Button onClick={() => void copy()}>{ru.access.keys.copy}</Button>
          </div>
        </div>
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-sm bg-risk-medium-soft px-3 py-2.5 text-ink"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none text-risk-medium" />
          <span>{ru.access.keys.warning(`ck_${issued.key.prefix}`)}</span>
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-ink-muted">{ru.access.keys.issuedScopes}</dt>
          <dd className="m-0">
            {issued.key.scopes.map((scope) => ru.access.keys.scopes[scope]).join(', ')}
          </dd>
          {issued.key.expiresAt && (
            <>
              <dt className="text-ink-muted">{ru.access.keys.issuedExpires}</dt>
              <dd className="m-0 font-mono tabular-nums">{formatDate(issued.key.expiresAt)}</dd>
            </>
          )}
        </dl>
      </div>
    </Dialog>
  );
}

export function CreateApiKey() {
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const { mutate, isPending, error, reset: resetMutation } = useCreateApiKey();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', scopes: [], expiresAt: '' },
  });

  const close = () => {
    setOpen(false);
    reset();
    resetMutation();
  };

  const submit = (values: FormValues) => {
    mutate(
      {
        name: values.name,
        scopes: values.scopes,
        ...(values.expiresAt && { expiresAt: endOfDay(values.expiresAt).toISOString() }),
      },
      {
        onSuccess: (created) => {
          close();
          setIssued(created);
        },
      },
    );
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {ru.access.keys.create}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={ru.access.keys.createTitle}
        actions={
          <>
            <Button onClick={close}>{ru.access.cancel}</Button>
            <Button type="submit" form={FORM_ID} variant="primary" loading={isPending}>
              {isPending ? ru.access.keys.submitting : ru.access.keys.submit}
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
          <Field label={ru.access.keys.name} id="key-name" error={errors.name?.message}>
            <Input
              id="key-name"
              invalid={Boolean(errors.name)}
              autoComplete="off"
              {...register('name')}
            />
          </Field>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 p-0 text-label text-ink-muted">
              {ru.access.keys.scopesLegend}
            </legend>
            <Controller
              control={control}
              name="scopes"
              render={({ field }) => (
                <>
                  {API_KEY_SCOPES.map((scope: ApiKeyScope) => (
                    <Checkbox
                      key={scope}
                      label={ru.access.keys.scopes[scope]}
                      checked={field.value.includes(scope)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, scope]
                            : field.value.filter((item) => item !== scope),
                        )
                      }
                    />
                  ))}
                </>
              )}
            />
            {errors.scopes && (
              <p className="m-0 text-caption text-negative">{errors.scopes.message}</p>
            )}
          </fieldset>
          <Field
            label={ru.access.keys.expiresAt}
            id="key-expires"
            hint={ru.access.keys.expiresHint}
            error={errors.expiresAt?.message}
          >
            <Input
              id="key-expires"
              type="date"
              invalid={Boolean(errors.expiresAt)}
              {...register('expiresAt')}
            />
          </Field>
          {error && (
            <div role="alert" className="rounded-sm bg-risk-high-soft px-3 py-2.5 text-risk-high">
              {errorMessage(error)}
            </div>
          )}
        </form>
      </Dialog>
      {issued && <IssuedKeyDialog issued={issued} onClose={() => setIssued(null)} />}
    </>
  );
}
