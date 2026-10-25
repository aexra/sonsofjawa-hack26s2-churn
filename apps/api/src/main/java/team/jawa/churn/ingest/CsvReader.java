package team.jawa.churn.ingest;

import java.util.ArrayList;
import java.util.List;

final class CsvReader {

    private static final String BOM = "\uFEFF";

    record Table(List<String> header, List<List<String>> records) {}

    static final class CsvFormatException extends RuntimeException {

        CsvFormatException(String message) {
            super(message);
        }
    }

    private CsvReader() {}

    static Table read(String input) {
        String text = input.startsWith(BOM) ? input.substring(1) : input;
        List<List<String>> records = new ArrayList<>();
        List<String> fields = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean inQuotes = false;
        boolean closed = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inQuotes) {
                if (c != '"') {
                    cell.append(c);
                } else if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else {
                    inQuotes = false;
                    closed = true;
                }
                continue;
            }
            if (c == ',') {
                fields.add(cell.toString());
                cell.setLength(0);
                closed = false;
            } else if (c == '\r' || c == '\n') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++;
                }
                finishRecord(records, fields, cell, closed);
                closed = false;
            } else if (closed) {
                throw new CsvFormatException("unexpected character after a closing quote");
            } else if (c == '"') {
                if (cell.length() > 0) {
                    throw new CsvFormatException("quote inside an unquoted field");
                }
                inQuotes = true;
            } else {
                cell.append(c);
            }
        }
        if (inQuotes) {
            throw new CsvFormatException("unterminated quoted field");
        }
        finishRecord(records, fields, cell, closed);
        if (records.isEmpty()) {
            return new Table(List.of(), List.of());
        }
        List<String> header = records.get(0).stream().map(String::trim).toList();
        return new Table(header, records.subList(1, records.size()));
    }

    private static void finishRecord(
            List<List<String>> records, List<String> fields, StringBuilder cell, boolean closed) {
        if (fields.isEmpty() && cell.length() == 0 && !closed) {
            return;
        }
        fields.add(cell.toString());
        records.add(new ArrayList<>(fields));
        fields.clear();
        cell.setLength(0);
    }
}
