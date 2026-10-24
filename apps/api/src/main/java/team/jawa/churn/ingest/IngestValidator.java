package team.jawa.churn.ingest;

import java.math.BigInteger;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
class IngestValidator {

    static final int MAX_ERRORS = 100;

    record Result(List<Map<String, Object>> rows, List<IngestError> errors) {}

    private static final class Problem extends Exception {

        private final String code;

        Problem(String code, String message) {
            super(message, null, false, false);
            this.code = code;
        }
    }

    Result validate(SourceEntity entity, List<Map<String, Object>> raw, boolean text, OffsetDateTime now) {
        List<Map<String, Object>> typed = new ArrayList<>(raw.size());
        List<IngestError> errors = new ArrayList<>();
        Set<Long> seenIds = new HashSet<>();
        for (int index = 0; index < raw.size() && errors.size() < MAX_ERRORS; index++) {
            int row = index + 1;
            Map<String, Object> values = new LinkedHashMap<>();
            List<IngestError> rowErrors = new ArrayList<>();
            readRow(entity, raw.get(index), text, row, values, rowErrors);
            if (rowErrors.isEmpty()) {
                checkRow(entity, values, now, row, rowErrors);
            }
            if (rowErrors.isEmpty() && values.get("id") instanceof Long id && !seenIds.add(id)) {
                rowErrors.add(error(entity, row, "id", "duplicate_id", "id " + id + " is repeated in the request"));
            }
            errors.addAll(rowErrors.subList(0, Math.min(rowErrors.size(), MAX_ERRORS - errors.size())));
            typed.add(values);
        }
        return new Result(typed, errors);
    }

    private void readRow(
            SourceEntity entity,
            Map<String, Object> raw,
            boolean text,
            int row,
            Map<String, Object> values,
            List<IngestError> errors) {
        for (String key : raw.keySet()) {
            if (entity.field(key).isEmpty()) {
                errors.add(error(entity, row, key, "unknown_field", "unknown field " + key));
            }
        }
        for (FieldSpec spec : entity.fields()) {
            if (!raw.containsKey(spec.name())) {
                if (spec.required()) {
                    errors.add(error(entity, row, spec.name(), "required", spec.name() + " is required"));
                }
                continue;
            }
            Object value = raw.get(spec.name());
            if (value == null) {
                if (spec.required()) {
                    errors.add(error(entity, row, spec.name(), "required", spec.name() + " must not be null"));
                } else if (spec.nullable()) {
                    values.put(spec.name(), null);
                }
                continue;
            }
            try {
                values.put(spec.name(), coerce(spec, value, text));
            } catch (Problem problem) {
                errors.add(error(entity, row, spec.name(), problem.code, problem.getMessage()));
            }
        }
    }

    private Object coerce(FieldSpec spec, Object value, boolean text) throws Problem {
        return switch (spec.kind()) {
            case INT64, INT32 -> coerceInteger(spec, value, text);
            case TEXT -> coerceText(spec, value);
            case BOOLEAN -> coerceBoolean(spec, value, text);
            case TIMESTAMP -> coerceTimestamp(spec, value);
            case ENUM -> coerceChoice(spec, value);
        };
    }

    private Object coerceInteger(FieldSpec spec, Object value, boolean text) throws Problem {
        long number;
        if (value instanceof Integer || value instanceof Long || value instanceof Short || value instanceof Byte) {
            number = ((Number) value).longValue();
        } else if (value instanceof BigInteger big) {
            if (big.bitLength() > 63) {
                throw new Problem("out_of_range", spec.name() + " is out of range");
            }
            number = big.longValue();
        } else if (text && value instanceof String string && string.strip().matches("-?\\d{1,19}")) {
            try {
                number = Long.parseLong(string.strip());
            } catch (NumberFormatException e) {
                throw new Problem("out_of_range", spec.name() + " is out of range");
            }
        } else {
            throw new Problem("invalid_type", spec.name() + " must be an integer");
        }
        if (spec.min() != null && number < spec.min() || spec.max() != null && number > spec.max()) {
            throw new Problem("out_of_range", spec.name() + " is out of range" + range(spec));
        }
        return spec.kind() == FieldSpec.Kind.INT32 ? (Object) (int) number : (Object) number;
    }

    private static String range(FieldSpec spec) {
        if (spec.min() != null && spec.max() != null) {
            return " (" + spec.min() + ".." + spec.max() + ")";
        }
        return spec.min() != null ? " (minimum " + spec.min() + ")" : "";
    }

    private Object coerceText(FieldSpec spec, Object value) throws Problem {
        if (!(value instanceof String string)) {
            throw new Problem("invalid_type", spec.name() + " must be a string");
        }
        if (string.isBlank()) {
            throw new Problem("blank", spec.name() + " must not be blank");
        }
        if (spec.maxLength() != null && string.length() > spec.maxLength()) {
            throw new Problem("too_long", spec.name() + " must be at most " + spec.maxLength() + " characters");
        }
        if (spec.pattern() != null && !spec.pattern().matcher(string).matches()) {
            throw new Problem(
                    "invalid_format",
                    spec.name() + " must match " + spec.pattern().pattern());
        }
        return string;
    }

    private Object coerceBoolean(FieldSpec spec, Object value, boolean text) throws Problem {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (text && value instanceof String string) {
            if ("true".equalsIgnoreCase(string.strip())) {
                return Boolean.TRUE;
            }
            if ("false".equalsIgnoreCase(string.strip())) {
                return Boolean.FALSE;
            }
        }
        throw new Problem("invalid_type", spec.name() + " must be true or false");
    }

    private Object coerceTimestamp(FieldSpec spec, Object value) throws Problem {
        if (!(value instanceof String string)) {
            throw new Problem("invalid_type", spec.name() + " must be an ISO 8601 timestamp with a zone");
        }
        try {
            return OffsetDateTime.parse(string.strip())
                    .withOffsetSameInstant(ZoneOffset.UTC)
                    .truncatedTo(ChronoUnit.MILLIS);
        } catch (DateTimeParseException e) {
            throw new Problem("invalid_format", spec.name() + " must be an ISO 8601 timestamp with a zone");
        }
    }

    private Object coerceChoice(FieldSpec spec, Object value) throws Problem {
        if (value instanceof String string && spec.values().contains(string)) {
            return string;
        }
        throw new Problem("invalid_value", spec.name() + " must be one of " + sorted(spec.values()));
    }

    private static List<String> sorted(Set<String> values) {
        return values.stream().sorted().toList();
    }

    private void checkRow(
            SourceEntity entity, Map<String, Object> values, OffsetDateTime now, int row, List<IngestError> errors) {
        boolean insertOnly = !values.containsKey("id");
        OffsetDateTime created = (OffsetDateTime) values.get("createdAt");
        OffsetDateTime reference = created != null ? created : insertOnly ? now : null;
        if (entity == SourceEntity.SERVICES) {
            OffsetDateTime expires = (OffsetDateTime) values.get("expiresAt");
            if (reference != null && expires != null && expires.isBefore(reference)) {
                errors.add(error(entity, row, "expiresAt", "before_created_at", "expiresAt must be >= createdAt"));
            }
        }
        if (entity == SourceEntity.TRANSACTIONS) {
            checkTransaction(entity, values, reference, row, errors);
        }
    }

    private void checkTransaction(
            SourceEntity entity,
            Map<String, Object> values,
            OffsetDateTime reference,
            int row,
            List<IngestError> errors) {
        Object status = values.get("status");
        OffsetDateTime performed = (OffsetDateTime) values.get("performedAt");
        if ("not_performed".equals(status) && performed != null) {
            errors.add(error(
                    entity,
                    row,
                    "performedAt",
                    "performed_at_mismatch",
                    "performedAt must be empty when not_performed"));
        } else if ("performed".equals(status) && performed == null) {
            errors.add(error(
                    entity, row, "performedAt", "performed_at_mismatch", "performedAt is required when performed"));
        } else if (status == null && performed != null) {
            errors.add(error(
                    entity,
                    row,
                    "status",
                    "performed_at_mismatch",
                    "status must be performed when performedAt is set"));
        } else if (performed != null && reference != null && performed.isBefore(reference)) {
            errors.add(error(entity, row, "performedAt", "before_created_at", "performedAt must be >= createdAt"));
        }
    }

    private static IngestError error(SourceEntity entity, int row, String field, String code, String message) {
        return new IngestError(row, entity.path(), field, code, message);
    }
}
