package team.jawa.churn.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import team.jawa.churn.events.EventBus;
import team.jawa.churn.recalc.RecalcScheduler;
import team.jawa.churn.web.ApiException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ModelSettingsService {

    public record Setting(
            String key,
            String group,
            BigDecimal value,
            BigDecimal defaultValue,
            BigDecimal min,
            BigDecimal max,
            String unit,
            String title,
            String description,
            BigDecimal share) {}

    public record Feature(String key, String weightKey, String title, String description, String reasonTemplate) {}

    public record Clock(
            String mode,
            OffsetDateTime asOf,
            OffsetDateTime frozenAt,
            long shiftSeconds,
            OffsetDateTime updatedAt,
            String updatedBy) {}

    public record Snapshot(
            long modelVersion,
            OffsetDateTime updatedAt,
            String updatedBy,
            Clock clock,
            Map<String, List<Setting>> groups,
            List<Feature> features) {}

    public record ClockChange(String mode, OffsetDateTime asOf) {}

    public record Revision(
            long version,
            OffsetDateTime changedAt,
            String changedBy,
            String source,
            List<Map<String, Object>> changes) {}

    public record Updated(Snapshot snapshot, RecalcScheduler.State recalc) {}

    private static final Logger log = LoggerFactory.getLogger(ModelSettingsService.class);
    private static final List<String> GROUPS = List.of("weights", "levels", "horizon", "quality");
    private static final TypeReference<List<Map<String, Object>>> CHANGES = new TypeReference<>() {};

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;
    private final EventBus events;
    private final RecalcScheduler scheduler;
    private final JsonMapper json;

    ModelSettingsService(
            JdbcClient jdbc,
            PlatformTransactionManager transactions,
            EventBus events,
            RecalcScheduler scheduler,
            JsonMapper json) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
        this.events = events;
        this.scheduler = scheduler;
        this.json = json;
    }

    public Snapshot snapshot() {
        List<Setting> settings = readSettings();
        BigDecimal weightSum = settings.stream()
                .filter(setting -> "weights".equals(setting.group()))
                .map(Setting::value)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, List<Setting>> groups = new LinkedHashMap<>();
        for (String group : GROUPS) {
            groups.put(group, new ArrayList<>());
        }
        for (Setting setting : settings) {
            BigDecimal share = "weights".equals(setting.group()) && weightSum.signum() > 0
                    ? setting.value().divide(weightSum, 4, RoundingMode.HALF_UP)
                    : null;
            groups.get(setting.group())
                    .add(new Setting(
                            setting.key(),
                            setting.group(),
                            setting.value(),
                            setting.defaultValue(),
                            setting.min(),
                            setting.max(),
                            setting.unit(),
                            setting.title(),
                            setting.description(),
                            share));
        }
        Optional<Revision> latest = latestRevision();
        return new Snapshot(
                latest.map(Revision::version).orElse(0L),
                latest.map(Revision::changedAt).orElse(null),
                latest.map(Revision::changedBy).orElse(null),
                readClock(),
                groups,
                readFeatures());
    }

    public List<Revision> revisions(int limit) {
        return jdbc.sql("SELECT version, changed_at, changed_by, source, changes::text AS changes"
                        + " FROM public.model_revisions ORDER BY version DESC LIMIT :limit")
                .param("limit", limit)
                .query((rs, row) -> new Revision(
                        rs.getLong("version"),
                        rs.getObject("changed_at", OffsetDateTime.class),
                        rs.getString("changed_by"),
                        rs.getString("source"),
                        parseChanges(rs.getString("changes"))))
                .list();
    }

    public Updated update(Map<String, BigDecimal> values, ClockChange clock, String actor) {
        long before = snapshot().modelVersion();
        try {
            transaction.executeWithoutResult(status -> apply(values, clock, actor));
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", "the model rejected the new values");
        }
        Snapshot snapshot = snapshot();
        if (snapshot.modelVersion() > before) {
            String source = values != null && !values.isEmpty() ? "settings" : "clock";
            events.publish("model.updated", Map.of("modelVersion", snapshot.modelVersion(), "source", source));
            log.info("model updated: version={} source={} by={}", snapshot.modelVersion(), source, actor);
        }
        return new Updated(snapshot, scheduler.requestNow("model"));
    }

    private void apply(Map<String, BigDecimal> values, ClockChange clock, String actor) {
        List<Setting> current = lockSettings();
        if (values != null && !values.isEmpty()) {
            validate(values, current);
            jdbc.sql("SELECT public.set_risk_settings(CAST(:values AS jsonb), :actor)")
                    .param("values", jsonOf(values))
                    .param("actor", actor)
                    .query()
                    .singleRow();
        }
        if (clock != null) {
            applyClock(clock, actor);
        }
    }

    private void validate(Map<String, BigDecimal> values, List<Setting> current) {
        Map<String, Setting> byKey = new LinkedHashMap<>();
        current.forEach(setting -> byKey.put(setting.key(), setting));
        List<String> unknown =
                values.keySet().stream().filter(key -> !byKey.containsKey(key)).toList();
        if (!unknown.isEmpty()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_field", "unknown model settings: " + String.join(", ", unknown));
        }
        List<Map<String, String>> errors = new ArrayList<>();
        Map<String, BigDecimal> merged = new LinkedHashMap<>();
        current.forEach(setting -> merged.put(setting.key(), setting.value()));
        values.forEach((key, value) -> {
            Setting setting = byKey.get(key);
            if (value.compareTo(setting.min()) < 0 || value.compareTo(setting.max()) > 0) {
                errors.add(error(
                        "values." + key,
                        "out_of_range",
                        "value must be between " + setting.min().toPlainString() + " and "
                                + setting.max().toPlainString()));
            } else if ("count".equals(setting.unit())
                    && value.stripTrailingZeros().scale() > 0) {
                errors.add(error("values." + key, "not_integer", "value must be a whole number"));
            } else {
                merged.put(key, value);
            }
        });
        BigDecimal weights = current.stream()
                .filter(setting -> "weights".equals(setting.group()))
                .map(setting -> merged.get(setting.key()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (weights.signum() <= 0) {
            errors.add(error("values", "weights_sum_not_positive", "the sum of weights must be positive"));
        }
        if (merged.get("level_medium").compareTo(merged.get("level_high")) >= 0) {
            errors.add(error(
                    "values.level_medium", "must_be_below_high", "medium risk threshold must be below high threshold"));
        }
        if (merged.get("payment_overdue_hours")
                        .compareTo(merged.get("payment_lookback_days").multiply(BigDecimal.valueOf(24)))
                >= 0) {
            errors.add(error(
                    "values.payment_overdue_hours",
                    "must_be_below_lookback",
                    "payment lookback must exceed overdue threshold"));
        }
        if (!errors.isEmpty()) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", "invalid model settings", errors);
        }
    }

    private void applyClock(ClockChange clock, String actor) {
        String mode = clock.mode();
        if (!"real".equals(mode) && clock.asOf() == null) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "validation_failed",
                    "asOf is required for this clock mode",
                    List.of(error("clock.asOf", "required", "asOf is required for frozen and shifted clock")));
        }
        switch (mode) {
            case "frozen" ->
                jdbc.sql("UPDATE public.model_clock SET mode = 'frozen', frozen_at = :asOf,"
                                + " shift = interval '0', updated_at = now(), updated_by = :actor WHERE id = 1")
                        .param("asOf", clock.asOf())
                        .param("actor", actor)
                        .update();
            case "shifted" ->
                jdbc.sql("UPDATE public.model_clock SET mode = 'shifted', frozen_at = NULL,"
                                + " shift = now() - :asOf, updated_at = now(), updated_by = :actor WHERE id = 1")
                        .param("asOf", clock.asOf())
                        .param("actor", actor)
                        .update();
            default ->
                jdbc.sql("UPDATE public.model_clock SET mode = 'real', frozen_at = NULL,"
                                + " shift = interval '0', updated_at = now(), updated_by = :actor WHERE id = 1")
                        .param("actor", actor)
                        .update();
        }
    }

    private List<Setting> lockSettings() {
        return jdbc.sql("SELECT key, group_key, value, default_value, min_value, max_value, unit, title, description"
                        + " FROM public.model_settings ORDER BY key FOR UPDATE")
                .query(ModelSettingsService::mapSetting)
                .list();
    }

    private List<Setting> readSettings() {
        return jdbc.sql("SELECT key, group_key, value, default_value, min_value, max_value, unit, title, description"
                        + " FROM public.model_settings ORDER BY sort_order, key")
                .query(ModelSettingsService::mapSetting)
                .list();
    }

    private List<Feature> readFeatures() {
        return jdbc.sql("SELECT key, weight_key, title, description, reason_template"
                        + " FROM public.model_features ORDER BY sort_order, key")
                .query((rs, row) -> new Feature(
                        rs.getString("key"),
                        rs.getString("weight_key"),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("reason_template")))
                .list();
    }

    private Clock readClock() {
        return jdbc.sql("SELECT mode, frozen_at, extract(epoch FROM shift)::bigint AS shift_seconds, updated_at,"
                        + " updated_by, public.model_now() AS as_of FROM public.model_clock WHERE id = 1")
                .query((rs, row) -> new Clock(
                        rs.getString("mode"),
                        rs.getObject("as_of", OffsetDateTime.class),
                        rs.getObject("frozen_at", OffsetDateTime.class),
                        rs.getLong("shift_seconds"),
                        rs.getObject("updated_at", OffsetDateTime.class),
                        rs.getString("updated_by")))
                .single();
    }

    private Optional<Revision> latestRevision() {
        return revisions(1).stream().findFirst();
    }

    private List<Map<String, Object>> parseChanges(String text) {
        return json.readValue(text, CHANGES);
    }

    private String jsonOf(Map<String, BigDecimal> values) {
        return json.writeValueAsString(values);
    }

    private static Setting mapSetting(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new Setting(
                rs.getString("key"),
                rs.getString("group_key"),
                rs.getBigDecimal("value"),
                rs.getBigDecimal("default_value"),
                rs.getBigDecimal("min_value"),
                rs.getBigDecimal("max_value"),
                rs.getString("unit"),
                rs.getString("title"),
                rs.getString("description"),
                null);
    }

    private static Map<String, String> error(String field, String code, String message) {
        Map<String, String> error = new LinkedHashMap<>();
        error.put("field", field);
        error.put("code", code);
        error.put("message", message);
        return error;
    }
}
