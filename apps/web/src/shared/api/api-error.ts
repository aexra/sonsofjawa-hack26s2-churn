import type { components } from './schema';

type Problem = components['schemas']['Problem'];

export type ProblemCode = Problem['code'];
type FieldError = components['schemas']['FieldError'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: ProblemCode | undefined;
  readonly errors: FieldError[];

  constructor(status: number, problem?: Partial<Problem>) {
    super(problem?.detail ?? problem?.title ?? `http ${String(status)}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code;
    this.errors = problem?.errors ?? [];
  }
}
