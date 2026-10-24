import Papa from 'papaparse';

export interface ParsedCsv {
  columns: string[];
  records: string[][];
  delimiter: string;
  unclosedQuote: boolean;
}

export const parseCsv = (text: string): ParsedCsv => {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const [columns = [], ...records] = parsed.data;
  return {
    columns: columns.map((column) => column.trim()),
    records,
    delimiter: parsed.meta.delimiter,
    unclosedQuote: parsed.errors.some((error) => error.type === 'Quotes'),
  };
};
