import { INGEST_ENTITIES, parseCsv, type IngestEntity } from '@/entities/ingest';

export type Counts = Record<IngestEntity, number>;

export interface JsonSource {
  kind: 'json';
  name: string;
  size: number;
  payload: Record<IngestEntity, unknown[]>;
  counts: Counts;
}

export interface CsvPart {
  file: File;
  rows: number;
}

export type CsvParts = Partial<Record<IngestEntity, CsvPart>>;

export type SnapshotProblem =
  | { kind: 'invalid-json'; name: string }
  | { kind: 'unknown-name'; name: string }
  | { kind: 'mixed' };

export const isJsonFile = (file: File): boolean =>
  file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');

export const entityOfFile = (file: File): IngestEntity | undefined => {
  const name = file.name.toLowerCase();
  return INGEST_ENTITIES.find((entity) => name.includes(entity));
};

const isEntityArrays = (value: unknown): value is Record<IngestEntity, unknown[]> =>
  typeof value === 'object' &&
  value !== null &&
  INGEST_ENTITIES.every((entity) => Array.isArray((value as Record<string, unknown>)[entity]));

export const readJsonSource = async (file: File): Promise<JsonSource | null> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return null;
  }
  if (!isEntityArrays(parsed)) return null;
  return {
    kind: 'json',
    name: file.name,
    size: file.size,
    payload: parsed,
    counts: {
      accounts: parsed.accounts.length,
      services: parsed.services.length,
      transactions: parsed.transactions.length,
    },
  };
};

export const readCsvPart = async (file: File): Promise<CsvPart> => ({
  file,
  rows: parseCsv(await file.text()).records.length,
});

export const csvCounts = (parts: CsvParts): Counts => ({
  accounts: parts.accounts?.rows ?? 0,
  services: parts.services?.rows ?? 0,
  transactions: parts.transactions?.rows ?? 0,
});

export const csvComplete = (parts: CsvParts): parts is Record<IngestEntity, CsvPart> =>
  INGEST_ENTITIES.every((entity) => parts[entity] !== undefined);
