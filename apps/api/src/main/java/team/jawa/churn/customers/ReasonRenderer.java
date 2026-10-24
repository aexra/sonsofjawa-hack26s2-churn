package team.jawa.churn.customers;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ReasonRenderer {

    public record Feature(String title, String template) {}

    public record Catalog(long version, Map<String, Feature> features) {}

    private static final Logger log = LoggerFactory.getLogger(ReasonRenderer.class);
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([A-Za-z0-9_]+)}");
    private static final Locale RU = Locale.forLanguageTag("ru-RU");
    private static final TypeReference<List<Map<String, Object>>> REASONS = new TypeReference<>() {};

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private volatile Catalog catalog;

    ReasonRenderer(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public List<Map<String, Object>> render(String reasonsJson, Catalog catalog) {
        if (reasonsJson == null || reasonsJson.isBlank()) {
            return List.of();
        }
        Map<String, Feature> features = catalog.features();
        List<Map<String, Object>> rendered = new ArrayList<>();
        for (Map<String, Object> raw : json.readValue(reasonsJson, REASONS)) {
            String key = String.valueOf(raw.get("key"));
            Feature feature = features.get(key);
            @SuppressWarnings("unchecked")
            Map<String, Object> params = (Map<String, Object>) raw.getOrDefault("params", Map.of());
            Map<String, Object> reason = new LinkedHashMap<>();
            reason.put("key", key);
            reason.put("title", feature == null ? key : feature.title());
            reason.put("text", feature == null ? key : fill(feature.template(), params));
            reason.put("value", raw.get("value"));
            reason.put("weight", raw.get("weight"));
            reason.put("contribution", raw.get("contribution"));
            reason.put("params", params);
            rendered.add(reason);
        }
        return rendered;
    }

    private String fill(String template, Map<String, Object> params) {
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder text = new StringBuilder();
        while (matcher.find()) {
            String name = matcher.group(1);
            Object value = params.get(name);
            if (value == null) {
                log.warn("reason template parameter is missing: name={}", name);
            }
            String replacement = value == null ? matcher.group() : format(name, value);
            matcher.appendReplacement(text, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(text);
        return text.toString();
    }

    private static String format(String name, Object value) {
        if (!(value instanceof Number number)) {
            return String.valueOf(value);
        }
        BigDecimal decimal = new BigDecimal(number.toString());
        if (name.endsWith("Amount")) {
            NumberFormat money = NumberFormat.getCurrencyInstance(RU);
            money.setCurrency(Currency.getInstance("EUR"));
            return money.format(decimal.movePointLeft(2));
        }
        if (name.endsWith("Pct")) {
            return decimal.setScale(0, RoundingMode.HALF_UP).toPlainString();
        }
        if (decimal.stripTrailingZeros().scale() <= 0) {
            return decimal.setScale(0, RoundingMode.HALF_UP).toPlainString();
        }
        return decimal.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    public Catalog catalog() {
        long version = jdbc.sql("SELECT coalesce(max(version), 0) FROM public.model_revisions")
                .query(Long.class)
                .single();
        Catalog current = catalog;
        if (current != null && current.version() == version) {
            return current;
        }
        Map<String, Feature> loaded = new LinkedHashMap<>();
        jdbc.sql("SELECT key, title, reason_template FROM public.model_features ORDER BY sort_order")
                .query((rs, row) -> {
                    loaded.put(
                            rs.getString("key"), new Feature(rs.getString("title"), rs.getString("reason_template")));
                    return null;
                })
                .list();
        Catalog fresh = new Catalog(version, loaded);
        catalog = fresh;
        return fresh;
    }
}
