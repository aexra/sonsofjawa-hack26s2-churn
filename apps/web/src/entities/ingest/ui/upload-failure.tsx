import { TriangleAlert } from 'lucide-react';

import { ru } from '@/shared/i18n/ru';
import { plural } from '@/shared/lib/plural';

import { describeError } from '../model/describe-error';

import type { UploadFailure } from '../model/failure';
import type { components } from '@/shared/api/schema';

type FieldError = components['schemas']['FieldError'];

export function ErrorTable({ errors }: { errors: readonly FieldError[] }) {
  return (
    <table className="border-collapse text-data">
      <thead>
        <tr className="text-left text-ink-muted">
          <th scope="col" className="py-1 pr-4 text-label">
            {ru.ingest.failure.row}
          </th>
          <th scope="col" className="py-1 pr-4 text-label">
            {ru.ingest.failure.field}
          </th>
          <th scope="col" className="py-1 text-label">
            {ru.ingest.failure.error}
          </th>
        </tr>
      </thead>
      <tbody>
        {errors.map((error, index) => (
          <tr key={`${String(error.row)}:${error.field ?? ''}:${String(index)}`}>
            <td className="py-1 pr-4 font-mono">{error.row ?? ru.common.emptyValue}</td>
            <td className="py-1 pr-4 font-mono">{error.field ?? ru.common.emptyValue}</td>
            <td className="py-1">{describeError(error)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const headline = (failure: UploadFailure): string => {
  switch (failure.kind) {
    case 'too-large':
      return ru.ingest.failure.tooLarge;
    case 'unsupported':
      return ru.ingest.failure.unsupported;
    case 'rejected':
      return failure.errors.length > 0
        ? ru.ingest.failure.rejected(
            failure.errors.length,
            plural(failure.errors.length, ru.ingest.failure.errorForms),
          )
        : ru.ingest.failure.rejectedNoDetails;
  }
};

export function UploadFailureAlert({ failure }: { failure: UploadFailure }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-negative bg-risk-high-soft px-4 py-3"
    >
      <div className="flex items-center gap-2.5 font-semibold text-negative">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        {headline(failure)}
      </div>
      {failure.kind === 'rejected' && failure.errors.length > 0 && (
        <div className="max-h-64 overflow-auto">
          <ErrorTable errors={failure.errors} />
        </div>
      )}
    </div>
  );
}
