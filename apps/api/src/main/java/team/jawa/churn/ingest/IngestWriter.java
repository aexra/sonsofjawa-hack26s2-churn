package team.jawa.churn.ingest;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class IngestWriter {

    static final int BATCH_SIZE = 1000;

    private record Shape(boolean withId, List<String> columns) {}

    private final JdbcTemplate jdbc;

    IngestWriter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    int write(SourceEntity entity, List<Map<String, Object>> rows) {
        Map<Shape, List<Map<String, Object>>> shapes = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            shapes.computeIfAbsent(shapeOf(entity, row), key -> new ArrayList<>())
                    .add(row);
        }
        shapes.forEach((shape, group) -> {
            if (shape.withId()) {
                batch(entity, shape, group);
            }
        });
        alignSequence(entity);
        shapes.forEach((shape, group) -> {
            if (!shape.withId()) {
                batch(entity, shape, group);
            }
        });
        return rows.size();
    }

    private static Shape shapeOf(SourceEntity entity, Map<String, Object> row) {
        List<String> columns = entity.fields().stream()
                .map(FieldSpec::name)
                .filter(row::containsKey)
                .filter(name -> !"id".equals(name))
                .toList();
        return new Shape(row.containsKey("id"), columns);
    }

    private void batch(SourceEntity entity, Shape shape, List<Map<String, Object>> rows) {
        List<String> bound = new ArrayList<>();
        if (shape.withId()) {
            bound.add("id");
        }
        bound.addAll(shape.columns());
        jdbc.batchUpdate(sql(entity, shape, bound), rows, BATCH_SIZE, (statement, row) -> bind(statement, row, bound));
    }

    private static String sql(SourceEntity entity, Shape shape, List<String> bound) {
        List<String> columns = new ArrayList<>(bound);
        List<String> values = new ArrayList<>(bound.stream().map(name -> "?").toList());
        for (FieldSpec spec : entity.fields()) {
            if (spec.modelNowDefault() && !bound.contains(spec.name())) {
                columns.add(spec.name());
                values.add("public.model_now()");
            }
        }
        StringBuilder sql = new StringBuilder("INSERT INTO ")
                .append(entity.table())
                .append(" (")
                .append(quoted(columns))
                .append(") VALUES (")
                .append(String.join(", ", values))
                .append(")");
        if (shape.withId()) {
            sql.append(" ON CONFLICT (id) DO UPDATE SET ")
                    .append(shape.columns().stream()
                            .map(name -> "\"" + name + "\" = EXCLUDED.\"" + name + "\"")
                            .collect(Collectors.joining(", ")));
        }
        return sql.toString();
    }

    private static String quoted(List<String> columns) {
        return columns.stream().map(name -> "\"" + name + "\"").collect(Collectors.joining(", "));
    }

    private static void bind(PreparedStatement statement, Map<String, Object> row, List<String> bound)
            throws SQLException {
        for (int index = 0; index < bound.size(); index++) {
            Object value = row.get(bound.get(index));
            if (value == null) {
                statement.setNull(index + 1, Types.TIMESTAMP_WITH_TIMEZONE);
            } else {
                statement.setObject(index + 1, value);
            }
        }
    }

    private void alignSequence(SourceEntity entity) {
        jdbc.queryForObject(
                "SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE(max(id), 1), max(id) IS NOT NULL) FROM "
                        + entity.table(),
                Long.class,
                entity.table());
    }
}
