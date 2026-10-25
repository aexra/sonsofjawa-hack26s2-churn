package team.jawa.churn.customers;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class CustomerCsv {

    private static final String SEPARATOR = "; ";

    private CustomerCsv() {}

    public static String write(List<CustomerColumn> columns, List<Map<String, Object>> rows) {
        StringBuilder csv = new StringBuilder();
        csv.append(columns.stream().map(CustomerColumn::apiName).collect(Collectors.joining(",")))
                .append("\r\n");
        for (Map<String, Object> row : rows) {
            csv.append(columns.stream()
                            .map(column -> escape(cell(column, row.get(column.apiName()))))
                            .collect(Collectors.joining(",")))
                    .append("\r\n");
        }
        return csv.toString();
    }

    private static String cell(CustomerColumn column, Object value) {
        if (value == null) {
            return "";
        }
        return switch (column.kind()) {
            case TOP_REASON -> text(value);
            case REASONS, STRING_ARRAY ->
                ((Collection<?>) value).stream().map(CustomerCsv::text).collect(Collectors.joining(SEPARATOR));
            case TIMESTAMP -> ((OffsetDateTime) value).toString();
            case DECIMAL, LONG -> String.valueOf(value);
            case STRING -> guard(String.valueOf(value));
        };
    }

    private static String text(Object value) {
        if (value instanceof Map<?, ?> map) {
            return guard(String.valueOf(map.get("text")));
        }
        return guard(String.valueOf(value));
    }

    private static String guard(String text) {
        if (!text.isEmpty() && "=+-@\t\r".indexOf(text.charAt(0)) >= 0) {
            return "'" + text;
        }
        return text;
    }

    private static String escape(String text) {
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }
}
