import type { CustomerRiskLevel, ScoreStatus } from './fields';

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type SortDir = 'asc' | 'desc';

export interface ListParams {
  sort: { field: string; dir: SortDir } | null;
  level: CustomerRiskLevel[];
  status: ScoreStatus[];
  q: string;
  minScore: number | null;
  maxScore: number | null;
  hasAnomalies: boolean;
  page: number;
  size: PageSize;
}

type ListFilter = Pick<
  ListParams,
  'level' | 'status' | 'q' | 'minScore' | 'maxScore' | 'hasAnomalies'
>;

export const EMPTY_FILTER: ListFilter = {
  level: [],
  status: [],
  q: '',
  minScore: null,
  maxScore: null,
  hasAnomalies: false,
};

const LEVELS: readonly CustomerRiskLevel[] = ['high', 'medium', 'low'];
const STATUSES: readonly ScoreStatus[] = ['scored', 'no_score', 'pending'];
const SORT_PATTERN = /^([a-zA-Z]+),(asc|desc)$/;

const list = <T extends string>(raw: string | null, allowed: readonly T[]): T[] =>
  (raw?.split(',') ?? []).filter((value): value is T =>
    (allowed as readonly string[]).includes(value),
  );

const score = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
};

export const readListParams = (search: URLSearchParams): ListParams => {
  const sort = SORT_PATTERN.exec(search.get('sort') ?? '');
  const size = Number(search.get('size'));
  const page = Number(search.get('page'));
  return {
    sort: sort?.[1] && sort[2] ? { field: sort[1], dir: sort[2] as SortDir } : null,
    level: list(search.get('level'), LEVELS),
    status: list(search.get('status'), STATUSES),
    q: search.get('q') ?? '',
    minScore: score(search.get('minScore')),
    maxScore: score(search.get('maxScore')),
    hasAnomalies: search.get('hasAnomalies') === 'true',
    page: Number.isInteger(page) && page > 1 ? page - 1 : 0,
    size: PAGE_SIZES.find((value) => value === size) ?? PAGE_SIZES[0],
  };
};

export const writeListParams = (params: ListParams): URLSearchParams => {
  const search = new URLSearchParams();
  if (params.q !== '') search.set('q', params.q);
  if (params.level.length > 0) search.set('level', params.level.join(','));
  if (params.status.length > 0) search.set('status', params.status.join(','));
  if (params.hasAnomalies) search.set('hasAnomalies', 'true');
  if (params.minScore !== null) search.set('minScore', String(params.minScore));
  if (params.maxScore !== null) search.set('maxScore', String(params.maxScore));
  if (params.sort) search.set('sort', `${params.sort.field},${params.sort.dir}`);
  if (params.size !== PAGE_SIZES[0]) search.set('size', String(params.size));
  if (params.page > 0) search.set('page', String(params.page + 1));
  return search;
};

export const hasActiveFilter = (params: ListParams): boolean =>
  params.q !== '' ||
  params.level.length > 0 ||
  params.status.length > 0 ||
  params.minScore !== null ||
  params.maxScore !== null ||
  params.hasAnomalies;
