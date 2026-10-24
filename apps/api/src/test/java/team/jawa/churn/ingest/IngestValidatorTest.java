package team.jawa.churn.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigInteger;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class IngestValidatorTest {

    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-19T15:00:00Z");

    private final IngestValidator validator = new IngestValidator();

    private static Map<String, Object> row(Object... pairs) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            row.put((String) pairs[i], pairs[i + 1]);
        }
        return row;
    }

    private static Map<String, Object> service(Object... overrides) {
        Map<String, Object> row = row(
                "name", "service-0001",
                "ownerId", 1,
                "paymentTerm", "month",
                "autoProlong", false,
                "createdAt", "2026-10-01T10:00:00Z",
                "expiresAt", "2026-11-01T10:00:00Z",
                "status", "active",
                "price", 500);
        for (int i = 0; i < overrides.length; i += 2) {
            row.put((String) overrides[i], overrides[i + 1]);
        }
        return row;
    }

    private IngestValidator.Result json(SourceEntity entity, Map<String, Object>... rows) {
        return validator.validate(entity, new ArrayList<>(List.of(rows)), false, NOW);
    }

    private IngestValidator.Result csv(SourceEntity entity, Map<String, Object>... rows) {
        return validator.validate(entity, new ArrayList<>(List.of(rows)), true, NOW);
    }

    private static List<String> codes(IngestValidator.Result result) {
        return result.errors().stream()
                .map(error -> error.field() + ":" + error.code())
                .toList();
    }

    @Test
    void acceptsAFullServiceAndTypesItsValues() {
        IngestValidator.Result result = json(SourceEntity.SERVICES, service("id", 26));

        assertThat(result.errors()).isEmpty();
        Map<String, Object> typed = result.rows().get(0);
        assertThat(typed.get("id")).isEqualTo(26L);
        assertThat(typed.get("price")).isEqualTo(500L);
        assertThat(typed.get("createdAt")).isEqualTo(OffsetDateTime.parse("2026-10-01T10:00:00Z"));
        assertThat(typed.get("autoProlong")).isEqualTo(false);
    }

    @Test
    void reportsRowNumbersFromOneAndTheEntity() {
        IngestValidator.Result result = json(SourceEntity.SERVICES, service(), service(), service("status", "gone"));

        assertThat(result.errors()).hasSize(1);
        IngestError error = result.errors().get(0);
        assertThat(error.row()).isEqualTo(3);
        assertThat(error.entity()).isEqualTo("services");
        assertThat(error.field()).isEqualTo("status");
        assertThat(error.code()).isEqualTo("invalid_value");
    }

    @Test
    void rejectsMissingRequiredFieldsAndUnknownFields() {
        Map<String, Object> bad = service("extra", 1);
        bad.remove("ownerId");

        IngestValidator.Result result = json(SourceEntity.SERVICES, bad);

        assertThat(codes(result)).contains("extra:unknown_field", "ownerId:required");
    }

    @Test
    void treatsAnExplicitNullAsMissingForRequiredFields() {
        IngestValidator.Result result = json(SourceEntity.SERVICES, service("price", null));

        assertThat(codes(result)).containsExactly("price:required");
    }

    @Test
    void rejectsWrongJsonTypesButAcceptsCsvStrings() {
        IngestValidator.Result json = json(SourceEntity.SERVICES, service("price", "500", "autoProlong", "true"));
        IngestValidator.Result csv = csv(SourceEntity.SERVICES, service("price", "500", "autoProlong", "TRUE"));

        assertThat(codes(json)).containsExactly("autoProlong:invalid_type", "price:invalid_type");
        assertThat(csv.errors()).isEmpty();
        assertThat(csv.rows().get(0).get("price")).isEqualTo(500L);
        assertThat(csv.rows().get(0).get("autoProlong")).isEqualTo(true);
    }

    @Test
    void rejectsFractionalAndOversizedNumbers() {
        IngestValidator.Result result = json(
                SourceEntity.SERVICES,
                service("price", 12.5),
                service("price", new BigInteger("99999999999999999999")),
                service("price", -1));

        assertThat(result.errors())
                .extracting(IngestError::code)
                .containsExactly("invalid_type", "out_of_range", "out_of_range");
    }

    @Test
    void checksDomainsOfEnumeratedFields() {
        IngestValidator.Result result =
                json(SourceEntity.SERVICES, service("paymentTerm", "decade"), service("status", "ACTIVE"));

        assertThat(result.errors()).extracting(IngestError::code).containsExactly("invalid_value", "invalid_value");
    }

    @Test
    void checksNameFormatAndBlankText() {
        IngestValidator.Result result = json(SourceEntity.SERVICES, service("name", "has space"), service("name", " "));

        assertThat(result.errors()).extracting(IngestError::code).containsExactly("invalid_format", "blank");
    }

    @Test
    void rejectsAnExpiryBeforeTheCreationTime() {
        IngestValidator.Result result = json(SourceEntity.SERVICES, service("expiresAt", "2026-09-01T10:00:00Z"));

        assertThat(codes(result)).containsExactly("expiresAt:before_created_at");
    }

    @Test
    void comparesAnInsertWithoutCreationTimeAgainstTheModelClock() {
        Map<String, Object> early = service("expiresAt", "2026-10-01T00:00:00Z");
        early.remove("createdAt");
        Map<String, Object> late = service("expiresAt", "2026-12-01T00:00:00Z");
        late.remove("createdAt");

        assertThat(codes(json(SourceEntity.SERVICES, early))).containsExactly("expiresAt:before_created_at");
        assertThat(json(SourceEntity.SERVICES, late).errors()).isEmpty();
    }

    @Test
    void rejectsTimestampsWithoutAZone() {
        IngestValidator.Result result = json(SourceEntity.SERVICES, service("expiresAt", "2026-11-01T10:00:00"));

        assertThat(codes(result)).containsExactly("expiresAt:invalid_format");
    }

    @Test
    void checksTheAmountRangeOfTransactions() {
        Map<String, Object> low = row("amount", -1, "type", "order", "serviceId", 1);
        Map<String, Object> high = row("amount", 1001, "type", "order", "serviceId", 1);
        Map<String, Object> edge = row("amount", 1000, "type", "order", "serviceId", 1);

        IngestValidator.Result result = json(SourceEntity.TRANSACTIONS, low, high, edge);

        assertThat(result.errors()).extracting(IngestError::row).containsExactly(1, 2);
        assertThat(result.errors()).extracting(IngestError::code).containsOnly("out_of_range");
    }

    @Test
    void keepsPerformedAtAndStatusConsistent() {
        Map<String, Object> early = row(
                "amount",
                10,
                "type",
                "prolong",
                "serviceId",
                1,
                "status",
                "performed",
                "createdAt",
                "2026-10-01T10:00:00Z",
                "performedAt",
                "2026-09-01T10:00:00Z");
        Map<String, Object> pendingWithTime = row(
                "amount",
                10,
                "type",
                "prolong",
                "serviceId",
                1,
                "status",
                "not_performed",
                "performedAt",
                "2026-10-01T10:00:00Z");
        Map<String, Object> performedWithoutTime =
                row("amount", 10, "type", "prolong", "serviceId", 1, "status", "performed");
        Map<String, Object> timeWithoutStatus =
                row("amount", 10, "type", "prolong", "serviceId", 1, "performedAt", "2026-10-01T10:00:00Z");

        IngestValidator.Result result =
                json(SourceEntity.TRANSACTIONS, early, pendingWithTime, performedWithoutTime, timeWithoutStatus);

        assertThat(codes(result))
                .containsExactly(
                        "performedAt:before_created_at",
                        "performedAt:performed_at_mismatch",
                        "performedAt:performed_at_mismatch",
                        "status:performed_at_mismatch");
    }

    @Test
    void allowsAnExplicitNullPerformedAt() {
        Map<String, Object> pending =
                row("amount", 10, "type", "order", "serviceId", 1, "status", "not_performed", "performedAt", null);

        IngestValidator.Result result = json(SourceEntity.TRANSACTIONS, pending);

        assertThat(result.errors()).isEmpty();
        assertThat(result.rows().get(0)).containsEntry("performedAt", null);
    }

    @Test
    void treatsEmptyOptionalCellsAsOmittedValues() {
        Map<String, Object> account = row("email", "a@example.test", "balance", null, "bonusState", null);

        IngestValidator.Result result = csv(SourceEntity.ACCOUNTS, account);

        assertThat(result.errors()).isEmpty();
        assertThat(result.rows().get(0)).containsOnlyKeys("email");
    }

    @Test
    void rejectsARepeatedIdInOneRequest() {
        IngestValidator.Result result = json(
                SourceEntity.ACCOUNTS,
                row("id", 5, "email", "a@example.test"),
                row("id", 5, "email", "b@example.test"));

        assertThat(result.errors()).hasSize(1);
        assertThat(result.errors().get(0).row()).isEqualTo(2);
        assertThat(result.errors().get(0).code()).isEqualTo("duplicate_id");
    }

    @Test
    void stopsAtOneHundredErrors() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < 250; i++) {
            rows.add(service("status", "gone"));
        }

        IngestValidator.Result result = validator.validate(SourceEntity.SERVICES, rows, false, NOW);

        assertThat(result.errors()).hasSize(IngestValidator.MAX_ERRORS);
    }
}
