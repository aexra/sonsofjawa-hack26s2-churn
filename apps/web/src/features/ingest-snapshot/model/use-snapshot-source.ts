import { useState } from 'react';

import { type IngestEntity, type SnapshotPayload } from '@/entities/ingest';

import {
  csvComplete,
  csvCounts,
  entityOfFile,
  isJsonFile,
  readCsvPart,
  readJsonSource,
  type Counts,
  type CsvParts,
  type JsonSource,
  type SnapshotProblem,
} from './snapshot-files';

export interface SnapshotSource {
  json: JsonSource | null;
  csv: CsvParts;
  problem: SnapshotProblem | null;
  ready: boolean;
  counts: Counts;
  payload: SnapshotPayload | null;
  pick: (files: File[]) => Promise<void>;
  removeJson: () => void;
  removeCsv: (entity: IngestEntity) => void;
  reset: () => void;
}

const snapshotPayload = (json: JsonSource | null, csv: CsvParts): SnapshotPayload | null => {
  if (json) return { format: 'json', body: json.payload };
  if (!csvComplete(csv)) return null;
  return {
    format: 'csv',
    files: {
      accounts: csv.accounts.file,
      services: csv.services.file,
      transactions: csv.transactions.file,
    },
  };
};

export function useSnapshotSource(): SnapshotSource {
  const [json, setJson] = useState<JsonSource | null>(null);
  const [csv, setCsv] = useState<CsvParts>({});
  const [problem, setProblem] = useState<SnapshotProblem | null>(null);

  const pick = async (files: File[]) => {
    setProblem(null);
    const jsonFiles = files.filter(isJsonFile);
    if (jsonFiles.length > 0 && jsonFiles.length < files.length) {
      setProblem({ kind: 'mixed' });
      return;
    }
    const [jsonFile] = jsonFiles;
    if (jsonFile) {
      const source = await readJsonSource(jsonFile);
      if (!source) {
        setProblem({ kind: 'invalid-json', name: jsonFile.name });
        return;
      }
      setJson(source);
      setCsv({});
      return;
    }
    const unknown = files.find((file) => !entityOfFile(file));
    if (unknown) {
      setProblem({ kind: 'unknown-name', name: unknown.name });
      return;
    }
    const parts = await Promise.all(
      files.map(async (file) => [entityOfFile(file), await readCsvPart(file)] as const),
    );
    setJson(null);
    setCsv((current) => {
      const next = { ...current };
      for (const [entity, part] of parts) if (entity) next[entity] = part;
      return next;
    });
  };

  const payload = snapshotPayload(json, csv);

  return {
    json,
    csv,
    problem,
    ready: payload !== null,
    counts: json ? json.counts : csvCounts(csv),
    payload,
    pick,
    removeJson: () => setJson(null),
    removeCsv: (entity) =>
      setCsv((current) => {
        const { [entity]: _removed, ...rest } = current;
        return rest;
      }),
    reset: () => {
      setJson(null);
      setCsv({});
      setProblem(null);
    },
  };
}
