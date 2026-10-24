package team.jawa.churn.ingest;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.sql.Array;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import team.jawa.churn.events.EventBus;
import team.jawa.churn.recalc.RecalcScheduler;
import team.jawa.churn.web.ApiException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Service
public class IngestService {

    public record Outcome(
            long logId,
            SourceEntity entity,
            IngestFormat format,
            int rowsReceived,
            int rowsApplied,
            RecalcScheduler.State recalc) {}

    private static final Logger log = LoggerFactory.getLogger(IngestService.class);
    private static final TypeReference<List<Map<String, Object>>> ROWS = new TypeReference<>() {};
    private static final String INGEST_TRIGGER = "ingest";

    private final IngestProperties properties;
    private final IngestValidator validator;
    private final IngestWriter writer;
    private final IngestLog journal;
    private final JdbcClient jdbc;
    private final JdbcTemplate template;
    private final TransactionTemplate transaction;
    private final RecalcScheduler scheduler;
    private final EventBus events;
    private final JsonMapper json;

    IngestService(
            IngestProperties properties,
            IngestValidator validator,
            IngestWriter writer,
            IngestLog journal,
            JdbcClient jdbc,
            JdbcTemplate template,
            TransactionTemplate transaction,
            RecalcScheduler scheduler,
            EventBus events,
            JsonMapper json) {
        this.properties = properties;
        this.validator = validator;
        this.writer = writer;
        this.journal = journal;
        this.jdbc = jdbc;
        this.template = template;
        this.transaction = transaction;
        this.scheduler = scheduler;
        this.events = events;
        this.json = json;
    }

    public Outcome upsert(SourceEntity entity, IngestFormat format, byte[] body, Actor actor) {
        int[] received = {0};
        try {
            return apply(entity, format, body, actor, received);
        } catch (ApiException e) {
            reject(entity, format, actor, received[0], e);
            throw e;
        }
    }

    private Outcome apply(SourceEntity entity, IngestFormat format, byte[] body, Actor actor, int[] received) {
        List<Map<String, Object>> rows = format == IngestFormat.JSON ? readJson(body) : readCsv(entity, body);
        received[0] = rows.size();
        if (rows.isEmpty()) {
            throw rejected(
                    "no rows to apply",
                    List.of(new IngestError(null, entity.path(), null, "empty_input", "the request has no rows")));
        }
        if (rows.size() > properties.maxRows()) {
            throw new ApiException(
                    HttpStatus.CONTENT_TOO_LARGE,
                    "payload_too_large",
                    "at most " + properties.maxRows() + " rows per request");
        }
        OffsetDateTime now = jdbc.sql("SELECT public.model_now()")
                .query(OffsetDateTime.class)
                .single();
        IngestValidator.Result validated = validator.validate(entity, rows, format == IngestFormat.CSV, now);
        List<IngestError> errors = new ArrayList<>(validated.errors());
        if (errors.isEmpty()) {
            errors.addAll(checkReferences(entity, validated.rows()));
        }
        if (!errors.isEmpty()) {
            throw rejected("input rejected: " + errors.size() + " error(s)", errors);
        }
        long[] logId = {0};
        try {
            transaction.executeWithoutResult(status -> {
                int applied = writer.write(entity, validated.rows());
                logId[0] = journal.insert(actor, entity, format, rows.size(), applied, List.of());
                events.publish(
                        "ingest.completed", Map.of("entity", entity.path(), "mode", "upsert", "rowsApplied", applied));
            });
        } catch (DataIntegrityViolationException e) {
            log.warn(
                    "ingest hit a database constraint: entity={} reason={}",
                    entity.path(),
                    e.getMostSpecificCause().getMessage());
            throw rejected(
                    "input rejected: database constraint",
                    List.of(new IngestError(
                            null, entity.path(), null, "constraint_violation", "a database constraint was violated")));
        }
        RecalcScheduler.State state = scheduler.requestNow(INGEST_TRIGGER);
        return new Outcome(logId[0], entity, format, rows.size(), rows.size(), state);
    }

    private void reject(SourceEntity entity, IngestFormat format, Actor actor, int received, ApiException e) {
        List<? extends Map<String, ?>> errors = e.errors().isEmpty()
                ? List.of(new IngestError(null, entity.path(), null, e.code(), e.getMessage()).toMap())
                : e.errors();
        try {
            journal.insert(actor, entity, format, received, 0, errors);
        } catch (RuntimeException failure) {
            log.warn("rejected upload was not journaled: {}", failure.getMessage());
        }
    }

    private ApiException rejected(String detail, List<IngestError> errors) {
        return new ApiException(
                HttpStatus.UNPROCESSABLE_CONTENT,
                "validation_failed",
                detail,
                errors.stream().map(IngestError::toMap).toList());
    }

    private List<Map<String, Object>> readJson(byte[] body) {
        try {
            List<Map<String, Object>> rows = json.readValue(body, ROWS);
            if (rows == null || rows.stream().anyMatch(Objects::isNull)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "body must be an array of objects");
            }
            return rows;
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "body must be a JSON array of objects");
        }
    }

    List<Map<String, Object>> readCsv(SourceEntity entity, byte[] body) {
        String text;
        try {
            text = StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(body))
                    .toString();
        } catch (CharacterCodingException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "body must be UTF-8 text");
        }
        CsvReader.Table table;
        try {
            table = CsvReader.read(text);
        } catch (CsvReader.CsvFormatException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "malformed csv: " + e.getMessage());
        }
        if (table.header().isEmpty()) {
            return List.of();
        }
        List<IngestError> errors = checkHeader(entity, table.header());
        if (!errors.isEmpty()) {
            throw rejected("csv header rejected", errors);
        }
        List<Map<String, Object>> rows = new ArrayList<>(table.records().size());
        List<IngestError> shape = new ArrayList<>();
        int number = 0;
        for (List<String> record : table.records()) {
            number++;
            if (record.size() != table.header().size()) {
                if (shape.size() < IngestValidator.MAX_ERRORS) {
                    shape.add(new IngestError(
                            number,
                            entity.path(),
                            null,
                            "invalid_row",
                            "expected " + table.header().size() + " cells, got " + record.size()));
                }
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int index = 0; index < record.size(); index++) {
                String cell = record.get(index);
                row.put(table.header().get(index), cell.isEmpty() ? null : cell);
            }
            rows.add(row);
        }
        if (!shape.isEmpty()) {
            throw rejected("input rejected: " + shape.size() + " error(s)", shape);
        }
        return rows;
    }

    private List<IngestError> checkHeader(SourceEntity entity, List<String> header) {
        List<IngestError> errors = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String column : header) {
            if (entity.field(column).isEmpty()) {
                errors.add(new IngestError(null, entity.path(), column, "unknown_column", "unknown column " + column));
            } else if (!seen.add(column)) {
                errors.add(new IngestError(
                        null, entity.path(), column, "duplicate_column", "column " + column + " is repeated"));
            }
        }
        for (FieldSpec spec : entity.fields()) {
            if (spec.required() && !header.contains(spec.name())) {
                errors.add(new IngestError(
                        null, entity.path(), spec.name(), "missing_column", "column " + spec.name() + " is required"));
            }
        }
        return errors;
    }

    private List<IngestError> checkReferences(SourceEntity entity, List<Map<String, Object>> rows) {
        String field;
        String table;
        switch (entity) {
            case SERVICES -> {
                field = "ownerId";
                table = "public.accounts";
            }
            case TRANSACTIONS -> {
                field = "serviceId";
                table = "public.services";
            }
            default -> {
                return List.of();
            }
        }
        Set<Long> wanted = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            wanted.add((Long) row.get(field));
        }
        Set<Long> existing = new HashSet<>(template.query(
                "SELECT id FROM " + table + " WHERE id = ANY (?)",
                statement -> {
                    Array ids = statement.getConnection().createArrayOf("bigint", wanted.toArray());
                    statement.setArray(1, ids);
                },
                (rs, index) -> rs.getLong(1)));
        List<IngestError> errors = new ArrayList<>();
        for (int index = 0; index < rows.size() && errors.size() < IngestValidator.MAX_ERRORS; index++) {
            Long id = (Long) rows.get(index).get(field);
            if (!existing.contains(id)) {
                errors.add(new IngestError(
                        index + 1, entity.path(), field, "unknown_reference", field + " " + id + " does not exist"));
            }
        }
        return errors;
    }
}
