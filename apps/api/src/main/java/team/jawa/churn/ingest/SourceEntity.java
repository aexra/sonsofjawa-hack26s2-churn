package team.jawa.churn.ingest;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

public enum SourceEntity {
    ACCOUNTS(
            "accounts",
            List.of(
                    FieldSpec.id(),
                    FieldSpec.text("email", 320, null),
                    FieldSpec.int64("balance", false, 0),
                    FieldSpec.int64("withdrawBalance", false, 0),
                    FieldSpec.int64("totalReplenished", false, 0),
                    FieldSpec.int64("bonusBalance", false, 0),
                    FieldSpec.choice("bonusState", false, "locked", "unlocked"))),
    SERVICES(
            "services",
            List.of(
                    FieldSpec.id(),
                    FieldSpec.text("name", null, Pattern.compile("^[A-Za-z0-9-]+$")),
                    FieldSpec.int64("ownerId", true, 1),
                    FieldSpec.choice("paymentTerm", true, "hour", "week", "month", "quarter_year", "half_year", "year"),
                    FieldSpec.bool("autoProlong"),
                    FieldSpec.timestamp("createdAt", false, false, true),
                    FieldSpec.timestamp("expiresAt", true, false, false),
                    FieldSpec.choice("status", true, "active", "blocked", "deleted", "suspended", "prolong_wait"),
                    FieldSpec.int64("price", true, 0))),
    TRANSACTIONS(
            "transactions",
            List.of(
                    FieldSpec.id(),
                    FieldSpec.int32("amount", true, 0, 1000),
                    FieldSpec.choice("status", false, "not_performed", "performed"),
                    FieldSpec.timestamp("performedAt", false, true, false),
                    FieldSpec.timestamp("createdAt", false, false, true),
                    FieldSpec.choice("type", true, "prolong", "order"),
                    FieldSpec.int64("serviceId", true, 1)));

    private final String path;
    private final List<FieldSpec> fields;

    SourceEntity(String path, List<FieldSpec> fields) {
        this.path = path;
        this.fields = fields;
    }

    public String path() {
        return path;
    }

    String table() {
        return "public." + path;
    }

    List<FieldSpec> fields() {
        return fields;
    }

    Optional<FieldSpec> field(String name) {
        return fields.stream().filter(field -> field.name().equals(name)).findFirst();
    }

    public static Optional<SourceEntity> byPath(String path) {
        for (SourceEntity entity : values()) {
            if (entity.path.equals(path)) {
                return Optional.of(entity);
            }
        }
        return Optional.empty();
    }
}
