package team.jawa.churn.ingest;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import team.jawa.churn.api.generated.model.Account;
import team.jawa.churn.api.generated.model.AccountPage;
import team.jawa.churn.api.generated.model.FieldError;
import team.jawa.churn.api.generated.model.IngestLogEntry;
import team.jawa.churn.api.generated.model.IngestLogPage;
import team.jawa.churn.api.generated.model.PaymentTerm;
import team.jawa.churn.api.generated.model.Service;
import team.jawa.churn.api.generated.model.ServicePage;
import team.jawa.churn.api.generated.model.ServiceStatus;
import team.jawa.churn.api.generated.model.Transaction;
import team.jawa.churn.api.generated.model.TransactionPage;
import team.jawa.churn.api.generated.model.TransactionStatus;
import team.jawa.churn.api.generated.model.TransactionType;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SourceReader {

    private static final TypeReference<List<Map<String, Object>>> ERRORS = new TypeReference<>() {};

    private final JdbcClient jdbc;
    private final JsonMapper json;

    SourceReader(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    private record Slice<T>(List<T> items, long total) {}

    public AccountPage accounts(List<Long> ids, int page, int size) {
        Slice<Account> slice = slice("public.accounts", ids, null, null, page, size, SourceReader::account);
        return new AccountPage(page, size, slice.total(), pages(slice.total(), size), slice.items());
    }

    public ServicePage services(List<Long> ids, Long ownerId, int page, int size) {
        Slice<Service> slice = slice("public.services", ids, "ownerId", ownerId, page, size, SourceReader::service);
        return new ServicePage(page, size, slice.total(), pages(slice.total(), size), slice.items());
    }

    public TransactionPage transactions(List<Long> ids, Long serviceId, int page, int size) {
        Slice<Transaction> slice =
                slice("public.transactions", ids, "serviceId", serviceId, page, size, SourceReader::transaction);
        return new TransactionPage(page, size, slice.total(), pages(slice.total(), size), slice.items());
    }

    public IngestLogPage log(int page, int size) {
        long total = jdbc.sql("SELECT count(*) FROM public.ingest_log")
                .query(Long.class)
                .single();
        List<IngestLogEntry> items = jdbc.sql("SELECT id, received_at, actor, channel, mode, entity, format,"
                        + " rows_received, rows_applied, status, errors::text AS errors FROM public.ingest_log"
                        + " ORDER BY received_at DESC, id DESC LIMIT :limit OFFSET :offset")
                .param("limit", size)
                .param("offset", (long) page * size)
                .query(this::logEntry)
                .list();
        return new IngestLogPage(page, size, total, pages(total, size), items);
    }

    private <T> Slice<T> slice(
            String table, List<Long> ids, String filterColumn, Long filter, int page, int size, RowMapper<T> mapper) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new LinkedHashMap<>();
        if (ids != null && !ids.isEmpty()) {
            where.append(" AND id IN (:ids)");
            params.put("ids", ids);
        }
        if (filterColumn != null && filter != null) {
            where.append(" AND \"").append(filterColumn).append("\" = :filter");
            params.put("filter", filter);
        }
        long total = jdbc.sql("SELECT count(*) FROM " + table + where)
                .params(params)
                .query(Long.class)
                .single();
        Map<String, Object> pageParams = new LinkedHashMap<>(params);
        pageParams.put("limit", size);
        pageParams.put("offset", (long) page * size);
        List<T> items = jdbc.sql("SELECT * FROM " + table + where + " ORDER BY id LIMIT :limit OFFSET :offset")
                .params(pageParams)
                .query(mapper)
                .list();
        return new Slice<>(items, total);
    }

    private static int pages(long total, int size) {
        return (int) ((total + size - 1) / size);
    }

    private static Account account(ResultSet rs, int row) throws SQLException {
        return new Account(
                rs.getLong("id"),
                rs.getString("email"),
                rs.getLong("balance"),
                rs.getLong("withdrawBalance"),
                rs.getLong("totalReplenished"),
                rs.getLong("bonusBalance"),
                Account.BonusStateEnum.fromValue(rs.getString("bonusState")));
    }

    private static Service service(ResultSet rs, int row) throws SQLException {
        return new Service(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getLong("ownerId"),
                PaymentTerm.fromValue(rs.getString("paymentTerm")),
                rs.getBoolean("autoProlong"),
                rs.getObject("createdAt", OffsetDateTime.class),
                rs.getObject("expiresAt", OffsetDateTime.class),
                ServiceStatus.fromValue(rs.getString("status")),
                rs.getLong("price"));
    }

    private static Transaction transaction(ResultSet rs, int row) throws SQLException {
        return new Transaction(
                        rs.getLong("id"),
                        rs.getInt("amount"),
                        TransactionStatus.fromValue(rs.getString("status")),
                        rs.getObject("createdAt", OffsetDateTime.class),
                        TransactionType.fromValue(rs.getString("type")),
                        rs.getLong("serviceId"))
                .performedAt(rs.getObject("performedAt", OffsetDateTime.class));
    }

    private IngestLogEntry logEntry(ResultSet rs, int row) throws SQLException {
        List<FieldError> errors = new ArrayList<>();
        for (Map<String, Object> item : json.readValue(rs.getString("errors"), ERRORS)) {
            FieldError error = new FieldError((String) item.get("code"), (String) item.get("message"));
            if (item.get("row") instanceof Number number) {
                error.row(number.intValue());
            }
            if (item.get("entity") instanceof String entity) {
                error.entity(FieldError.EntityEnum.fromValue(entity));
            }
            if (item.get("field") instanceof String field) {
                error.field(field);
            }
            errors.add(error);
        }
        return new IngestLogEntry(
                rs.getLong("id"),
                rs.getObject("received_at", OffsetDateTime.class),
                rs.getString("actor"),
                IngestLogEntry.ChannelEnum.fromValue(rs.getString("channel")),
                IngestLogEntry.ModeEnum.fromValue(rs.getString("mode")),
                IngestLogEntry.EntityEnum.fromValue(rs.getString("entity")),
                IngestLogEntry.FormatEnum.fromValue(rs.getString("format")),
                rs.getInt("rows_received"),
                rs.getInt("rows_applied"),
                IngestLogEntry.StatusEnum.fromValue(rs.getString("status")),
                errors);
    }
}
