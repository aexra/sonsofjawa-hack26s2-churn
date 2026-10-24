package team.jawa.churn.customers;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import team.jawa.churn.web.ApiException;

public record CustomerQuery(
        List<CustomerColumn> columns,
        List<Sort> sorts,
        List<String> levels,
        List<String> statuses,
        String text,
        BigDecimal minScore,
        BigDecimal maxScore,
        Long minLoss,
        Boolean hasAnomalies) {

    public record Sort(CustomerColumn column, boolean descending) {

        public String label() {
            return column.apiName() + "," + (descending ? "desc" : "asc");
        }
    }

    public static CustomerQuery of(
            List<String> sort,
            List<String> fields,
            List<String> levels,
            List<String> statuses,
            String text,
            BigDecimal minScore,
            BigDecimal maxScore,
            Long minLoss,
            Boolean hasAnomalies) {
        if (minScore != null && maxScore != null && minScore.compareTo(maxScore) > 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_filter", "minScore must not exceed maxScore");
        }
        return new CustomerQuery(
                columns(fields),
                sorts(sort),
                levels == null ? List.of() : List.copyOf(new LinkedHashSet<>(levels)),
                statuses == null ? List.of() : List.copyOf(new LinkedHashSet<>(statuses)),
                text == null || text.isBlank() ? null : text.strip(),
                minScore,
                maxScore,
                minLoss,
                hasAnomalies);
    }

    private static List<CustomerColumn> columns(List<String> fields) {
        if (fields == null || fields.isEmpty()) {
            return CustomerColumn.DEFAULTS;
        }
        LinkedHashSet<CustomerColumn> columns = new LinkedHashSet<>();
        for (String name : fields) {
            columns.add(CustomerColumn.byApiName(name)
                    .orElseThrow(
                            () -> new ApiException(HttpStatus.BAD_REQUEST, "invalid_field", "unknown field: " + name)));
        }
        return List.copyOf(columns);
    }

    private static List<Sort> sorts(List<String> sort) {
        List<Sort> result = new ArrayList<>();
        for (String item : sort == null ? List.<String>of() : sort) {
            String[] parts = item.split(",");
            if (parts.length != 2) {
                throw invalidSort(item);
            }
            CustomerColumn column = CustomerColumn.byApiName(parts[0])
                    .filter(candidate -> candidate.sortExpression().isPresent())
                    .orElseThrow(() -> invalidSort(item));
            Sort next = new Sort(column, "desc".equals(parts[1]));
            if (result.stream().noneMatch(existing -> existing.column() == column)) {
                result.add(next);
            }
        }
        if (result.stream().noneMatch(existing -> existing.column() == CustomerColumn.ID)) {
            result.add(new Sort(CustomerColumn.ID, false));
        }
        return List.copyOf(result);
    }

    private static ApiException invalidSort(String item) {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_sort", "cannot sort by: " + item);
    }
}
