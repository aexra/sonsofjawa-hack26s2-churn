import { fieldKeys, parseCsv, requiredFieldKeys, type IngestEntity } from '@/entities/ingest';
import { ru } from '@/shared/i18n/ru';

export const PREVIEW_ROWS = 20;
const EXPECTED_DELIMITER = ',';

interface CsvPreview {
  columns: string[];
  rows: string[][];
  totalRows: number;
  delimiter: string;
  issues: string[];
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const headerIssues = (entity: IngestEntity, columns: string[]): string[] => {
  const known = fieldKeys(entity);
  const issues: string[] = [];
  const unknown = unique(columns.filter((column) => !known.includes(column)));
  const duplicated = unique(columns.filter((column, index) => columns.indexOf(column) !== index));
  const missing = requiredFieldKeys(entity).filter((column) => !columns.includes(column));
  if (missing.length > 0) issues.push(ru.ingest.csv.missingColumns(missing.join(', ')));
  if (unknown.length > 0) issues.push(ru.ingest.csv.unknownColumns(unknown.join(', ')));
  if (duplicated.length > 0) issues.push(ru.ingest.csv.duplicateColumns(duplicated.join(', ')));
  return issues;
};

export const previewCsv = (text: string, entity: IngestEntity): CsvPreview => {
  const { columns, records, delimiter, unclosedQuote } = parseCsv(text);
  const issues: string[] = [];

  if (unclosedQuote) issues.push(ru.ingest.csv.unclosedQuote);
  if (columns.length === 0) {
    issues.push(ru.ingest.csv.empty);
  } else {
    if (delimiter !== EXPECTED_DELIMITER && columns.length > 1) {
      issues.push(ru.ingest.csv.delimiter(ru.ingest.csv.delimiterName(delimiter)));
    }
    issues.push(...headerIssues(entity, columns));
    const ragged = records.findIndex((record) => record.length !== columns.length);
    if (ragged >= 0) issues.push(ru.ingest.csv.raggedRow(ragged + 1));
    if (records.length === 0) issues.push(ru.ingest.csv.noRows);
  }

  return {
    columns,
    rows: records.slice(0, PREVIEW_ROWS),
    totalRows: records.length,
    delimiter,
    issues,
  };
};
