package team.jawa.churn.ingest;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
public class SnapshotService {

    public record Outcome(
            long logId,
            IngestFormat format,
            int rowsReceived,
            int rowsApplied,
            int accounts,
            int services,
            int transactions,
            RecalcScheduler.State recalc) {}

    private static final Logger log = LoggerFactory.getLogger(SnapshotService.class);
    private static final TypeReference<Map<String, Object>> OBJECT = new TypeReference<>() {};
    private static final List<String> NAMES = List.of("accounts", "services", "transactions");
    private static final Set<String> KNOWN = Set.copyOf(NAMES);
    private static final List<SourceEntity> ENTITIES =
            List.of(SourceEntity.ACCOUNTS, SourceEntity.SERVICES, SourceEntity.TRANSACTIONS);
    private static final String SNAPSHOT = "snapshot";

    private final IngestProperties properties;
    private final IngestValidator validator;
    private final IngestWriter writer;
    private final IngestLog journal;
    private final IngestService ingest;
    private final JdbcClient jdbc;
    private final JdbcTemplate template;
    private final TransactionTemplate transaction;
    private final RecalcScheduler scheduler;
    private final EventBus events;
    private final JsonMapper json;

    SnapshotService(
            IngestProperties properties,
            IngestValidator validator,
            IngestWriter writer,
            IngestLog journal,
            IngestService ingest,
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
        this.ingest = ingest;
        this.jdbc = jdbc;
        this.template = template;
        this.transaction = transaction;
        this.scheduler = scheduler;
        this.events = events;
        this.json = json;
    }

    public Outcome replaceJson(byte[] body, Actor actor) {
        int[] received = {0};
        try {
            Outcome outcome = applyJson(body, actor, received);
            publish(actor, outcome);
            return outcome;
        } catch (ApiException e) {
            reject(IngestFormat.JSON, actor, received[0], e);
            throw e;
        }
    }

    public Outcome replaceCsv(byte[] accounts, byte[] services, byte[] transactions, Actor actor) {
        int[] received = {0};
        try {
            Outcome outcome = applyCsv(accounts, services, transactions, actor, received);
            publish(actor, outcome);
            return outcome;
        } catch (ApiException e) {
            reject(IngestFormat.CSV, actor, received[0], e);
            throw e;
        }
    }

    private Outcome applyJson(byte[] body, Actor actor, int[] received) {
        List<List<Map<String, Object>>> tables = readJson(body);
        return apply(IngestFormat.JSON, false, tables, actor, received);
    }

    private Outcome applyCsv(byte[] accounts, byte[] services, byte[] transactions, Actor actor, int[] received) {
        requireParts(accounts, services, transactions);
        List<List<Map<String, Object>>> tables = new ArrayList<>();
        byte[][] parts = {accounts, services, transactions};
        for (int index = 0; index < ENTITIES.size(); index++) {
            tables.add(ingest.readCsv(ENTITIES.get(index), parts[index]));
            received[0] += tables.get(index).size();
        }
        return apply(IngestFormat.CSV, true, tables, actor, received);
    }

    private Outcome apply(
            IngestFormat format, boolean text, List<List<Map<String, Object>>> tables, Actor actor, int[] received) {
        received[0] = tables.stream().mapToInt(List::size).sum();
        if (received[0] > properties.maxRows()) {
            throw new ApiException(
                    HttpStatus.CONTENT_TOO_LARGE,
                    "payload_too_large",
                    "at most " + properties.maxRows() + " rows per request");
        }
        OffsetDateTime now = jdbc.sql("SELECT public.model_now()")
                .query(OffsetDateTime.class)
                .single();
        List<IngestValidator.Result> validated = new ArrayList<>();
        List<IngestError> errors = new ArrayList<>();
        for (int index = 0; index < ENTITIES.size(); index++) {
            IngestValidator.Result result = validator.validate(ENTITIES.get(index), tables.get(index), text, now);
            validated.add(result);
            take(errors, result.errors());
        }
        if (errors.isEmpty()) {
            take(
                    errors,
                    references(
                            validated.get(0).rows(),
                            validated.get(1).rows(),
                            validated.get(2).rows()));
        }
        if (!errors.isEmpty()) {
            throw rejected("input rejected: " + errors.size() + " error(s)", errors);
        }
        try {
            transaction.executeWithoutResult(status -> {
                template.execute("TRUNCATE public.transactions, public.services, public.accounts");
                writer.write(SourceEntity.ACCOUNTS, validated.get(0).rows());
                writer.write(SourceEntity.SERVICES, validated.get(1).rows());
                writer.write(SourceEntity.TRANSACTIONS, validated.get(2).rows());
            });
        } catch (DataIntegrityViolationException e) {
            log.warn(
                    "snapshot hit a database constraint: reason={}",
                    e.getMostSpecificCause().getMessage());
            throw rejected(
                    "input rejected: database constraint",
                    List.of(new IngestError(
                            null, null, null, "constraint_violation", "a database constraint was violated")));
        }
        int accounts = validated.get(0).rows().size();
        int services = validated.get(1).rows().size();
        int transactions = validated.get(2).rows().size();
        int applied = accounts + services + transactions;
        RecalcScheduler.State state = scheduler.requestNow(SNAPSHOT);
        long logId = journal.insert(actor, SNAPSHOT, SNAPSHOT, format, received[0], applied, List.of());
        return new Outcome(logId, format, received[0], applied, accounts, services, transactions, state);
    }

    private void publish(Actor actor, Outcome outcome) {
        events.publish(
                "ingest.completed",
                Map.of(
                        "source",
                        actor.channel(),
                        "entity",
                        SNAPSHOT,
                        "mode",
                        SNAPSHOT,
                        "rowsApplied",
                        outcome.rowsApplied()));
    }

    private void reject(IngestFormat format, Actor actor, int received, ApiException e) {
        List<? extends Map<String, ?>> errors = e.errors().isEmpty()
                ? List.of(new IngestError(null, null, null, e.code(), e.getMessage()).toMap())
                : e.errors();
        try {
            journal.insert(actor, SNAPSHOT, SNAPSHOT, format, received, 0, errors);
        } catch (RuntimeException failure) {
            log.warn("rejected upload was not journaled: {}", failure.getMessage());
        }
    }

    private List<List<Map<String, Object>>> readJson(byte[] body) {
        Map<String, Object> root;
        try {
            root = json.readValue(body, OBJECT);
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "body must be a JSON object");
        }
        if (root == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "body must be a JSON object");
        }
        List<IngestError> errors = new ArrayList<>();
        for (String key : root.keySet()) {
            if (!KNOWN.contains(key)) {
                errors.add(new IngestError(null, null, key, "unknown_field", "unknown field " + key));
            }
        }
        List<List<Map<String, Object>>> tables = new ArrayList<>();
        for (String name : NAMES) {
            if (!root.containsKey(name) || root.get(name) == null) {
                errors.add(new IngestError(null, name, name, "required", name + " is required"));
                tables.add(List.of());
                continue;
            }
            if (!(root.get(name) instanceof List<?> list)) {
                errors.add(new IngestError(null, name, name, "invalid_type", name + " must be an array"));
                tables.add(List.of());
                continue;
            }
            tables.add(objects(name, list));
        }
        if (!errors.isEmpty()) {
            throw rejected("input rejected: " + errors.size() + " error(s)", errors);
        }
        return tables;
    }

    private List<Map<String, Object>> objects(String name, List<?> list) {
        List<Map<String, Object>> rows = new ArrayList<>(list.size());
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> raw)) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST, "validation_failed", name + " must be an array of objects");
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                if (!(entry.getKey() instanceof String key)) {
                    throw new ApiException(
                            HttpStatus.BAD_REQUEST, "validation_failed", name + " must be an array of objects");
                }
                row.put(key, entry.getValue());
            }
            rows.add(row);
        }
        return rows;
    }

    private void requireParts(byte[] accounts, byte[] services, byte[] transactions) {
        List<IngestError> errors = new ArrayList<>();
        if (accounts == null) {
            errors.add(new IngestError(null, "accounts", "accounts", "required", "part accounts is required"));
        }
        if (services == null) {
            errors.add(new IngestError(null, "services", "services", "required", "part services is required"));
        }
        if (transactions == null) {
            errors.add(
                    new IngestError(null, "transactions", "transactions", "required", "part transactions is required"));
        }
        if (!errors.isEmpty()) {
            throw rejected("input rejected: " + errors.size() + " error(s)", errors);
        }
    }

    private static List<IngestError> references(
            List<Map<String, Object>> accounts,
            List<Map<String, Object>> services,
            List<Map<String, Object>> transactions) {
        Set<Long> accountIds = ids(accounts);
        Set<Long> serviceIds = ids(services);
        List<IngestError> errors = new ArrayList<>();
        for (int index = 0; index < services.size() && errors.size() < IngestValidator.MAX_ERRORS; index++) {
            Long ownerId = (Long) services.get(index).get("ownerId");
            if (!accountIds.contains(ownerId)) {
                errors.add(new IngestError(
                        index + 1,
                        SourceEntity.SERVICES.path(),
                        "ownerId",
                        "unknown_reference",
                        "ownerId " + ownerId + " does not exist"));
            }
        }
        for (int index = 0; index < transactions.size() && errors.size() < IngestValidator.MAX_ERRORS; index++) {
            Long serviceId = (Long) transactions.get(index).get("serviceId");
            if (!serviceIds.contains(serviceId)) {
                errors.add(new IngestError(
                        index + 1,
                        SourceEntity.TRANSACTIONS.path(),
                        "serviceId",
                        "unknown_reference",
                        "serviceId " + serviceId + " does not exist"));
            }
        }
        return errors;
    }

    private static Set<Long> ids(List<Map<String, Object>> rows) {
        Set<Long> ids = new HashSet<>();
        for (Map<String, Object> row : rows) {
            if (row.get("id") instanceof Long id) {
                ids.add(id);
            }
        }
        return ids;
    }

    private static void take(List<IngestError> errors, List<IngestError> more) {
        for (IngestError error : more) {
            if (errors.size() >= IngestValidator.MAX_ERRORS) {
                return;
            }
            errors.add(error);
        }
    }

    private ApiException rejected(String detail, List<IngestError> errors) {
        return new ApiException(
                HttpStatus.UNPROCESSABLE_CONTENT,
                "validation_failed",
                detail,
                errors.stream()
                        .limit(IngestValidator.MAX_ERRORS)
                        .map(IngestError::toMap)
                        .toList());
    }
}
