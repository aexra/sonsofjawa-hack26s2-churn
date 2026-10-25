package team.jawa.churn.customers;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CustomerRepository {

    public record Rows(List<Map<String, Object>> items, long total) {}

    private final JdbcClient jdbc;
    private final ReasonRenderer reasons;

    CustomerRepository(JdbcClient jdbc, ReasonRenderer reasons) {
        this.jdbc = jdbc;
        this.reasons = reasons;
    }

    public Rows page(CustomerQuery query, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(query, params);
        long total = jdbc.sql("SELECT count(*) FROM public.customer_scores_vw" + where)
                .params(params)
                .query(Long.class)
                .single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<Map<String, Object>> items = select(query, where, params, " LIMIT :limit OFFSET :offset");
        return new Rows(items, total);
    }

    public List<Map<String, Object>> all(CustomerQuery query, int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(query, params);
        params.put("limit", limit);
        return select(query, where, params, " LIMIT :limit");
    }

    private List<Map<String, Object>> select(
            CustomerQuery query, String where, Map<String, Object> params, String paging) {
        StringBuilder sql = new StringBuilder("SELECT ");
        for (int i = 0; i < query.columns().size(); i++) {
            CustomerColumn column = query.columns().get(i);
            sql.append(i == 0 ? "" : ", ")
                    .append(column.selectExpression())
                    .append(" AS \"")
                    .append(column.apiName())
                    .append('"');
        }
        sql.append(" FROM public.customer_scores_vw").append(where).append(" ORDER BY ");
        for (int i = 0; i < query.sorts().size(); i++) {
            CustomerQuery.Sort sort = query.sorts().get(i);
            sql.append(i == 0 ? "" : ", ")
                    .append(sort.column().sortExpression().orElseThrow())
                    .append(sort.descending() ? " DESC" : " ASC")
                    .append(" NULLS LAST");
        }
        sql.append(paging);
        ReasonRenderer.Catalog catalog = query.columns().stream()
                        .anyMatch(column -> column.kind() == CustomerColumn.Kind.TOP_REASON
                                || column.kind() == CustomerColumn.Kind.REASONS)
                ? reasons.catalog()
                : null;
        return jdbc.sql(sql.toString())
                .params(params)
                .query((rs, row) -> map(rs, query.columns(), catalog))
                .list();
    }

    private String where(CustomerQuery query, Map<String, Object> params) {
        List<String> conditions = new ArrayList<>();
        if (!query.levels().isEmpty()) {
            conditions.add("risk_level IN (:levels)");
            params.put("levels", query.levels());
        }
        if (!query.statuses().isEmpty()) {
            conditions.add("score_status IN (:statuses)");
            params.put("statuses", query.statuses());
        }
        if (query.text() != null) {
            String pattern =
                    "%" + query.text().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            params.put("pattern", pattern);
            if (query.text().matches("\\d{1,18}")) {
                conditions.add("(email ILIKE :pattern ESCAPE '\\' OR id = :textId)");
                params.put("textId", Long.parseLong(query.text()));
            } else {
                conditions.add("email ILIKE :pattern ESCAPE '\\'");
            }
        }
        if (query.minScore() != null) {
            conditions.add("risk_score >= :minScore");
            params.put("minScore", query.minScore());
        }
        if (query.maxScore() != null) {
            conditions.add("risk_score <= :maxScore");
            params.put("maxScore", query.maxScore());
        }
        if (query.minLoss() != null) {
            conditions.add("expected_loss >= :minLoss");
            params.put("minLoss", query.minLoss());
        }
        if (query.hasAnomalies() != null) {
            conditions.add(
                    query.hasAnomalies()
                            ? "coalesce(cardinality(anomalies), 0) > 0"
                            : "coalesce(cardinality(anomalies), 0) = 0");
        }
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    private Map<String, Object> map(ResultSet rs, List<CustomerColumn> columns, ReasonRenderer.Catalog catalog)
            throws SQLException {
        Map<String, Object> row = new LinkedHashMap<>();
        for (CustomerColumn column : columns) {
            String alias = column.apiName();
            row.put(
                    alias,
                    switch (column.kind()) {
                        case STRING -> rs.getString(alias);
                        case LONG -> {
                            long value = rs.getLong(alias);
                            yield rs.wasNull() ? null : value;
                        }
                        case DECIMAL -> rs.getBigDecimal(alias);
                        case TIMESTAMP -> rs.getObject(alias, OffsetDateTime.class);
                        case STRING_ARRAY -> {
                            Array array = rs.getArray(alias);
                            if (array == null) {
                                yield List.of();
                            }
                            try {
                                yield List.of((String[]) array.getArray());
                            } finally {
                                array.free();
                            }
                        }
                        case REASONS -> reasons.render(rs.getString(alias), catalog);
                        case TOP_REASON ->
                            reasons.render(rs.getString(alias), catalog).stream()
                                    .findFirst()
                                    .orElse(null);
                    });
        }
        return row;
    }
}
