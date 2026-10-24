import { fieldKeys, type IngestEntity } from '@/entities/ingest';

export const templateHref = (entity: IngestEntity): string =>
  `data:text/csv;charset=utf-8,${encodeURIComponent(`${fieldKeys(entity).join(',')}\n`)}`;

export const templateFileName = (entity: IngestEntity): string => `${entity}.csv`;
