package team.jawa.churn.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ApiKeyRepository {

    private static final String SELECT =
            "SELECT k.id, k.name, k.prefix, k.secret_hash, k.scopes, u.login AS created_by,"
                    + " k.created_at, k.expires_at, k.last_used_at, k.revoked_at"
                    + " FROM public.api_keys k LEFT JOIN public.users u ON u.id = k.created_by";

    private final JdbcClient jdbc;

    ApiKeyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public ApiKeyRecord insert(
            String name,
            String prefix,
            String secretHash,
            List<String> scopes,
            Long createdBy,
            OffsetDateTime expiresAt) {
        long id = jdbc.sql("INSERT INTO public.api_keys (name, prefix, secret_hash, scopes, created_by, expires_at)"
                        + " VALUES (:name, :prefix, :secretHash, :scopes, :createdBy, :expiresAt) RETURNING id")
                .param("name", name)
                .param("prefix", prefix)
                .param("secretHash", secretHash)
                .param("scopes", scopes.toArray(String[]::new))
                .param("createdBy", createdBy, Types.BIGINT)
                .param("expiresAt", expiresAt, Types.TIMESTAMP_WITH_TIMEZONE)
                .query(Long.class)
                .single();
        return findById(id).orElseThrow();
    }

    public Optional<ApiKeyRecord> findById(long id) {
        return jdbc.sql(SELECT + " WHERE k.id = :id")
                .param("id", id)
                .query(ApiKeyRepository::map)
                .optional();
    }

    public Optional<ApiKeyRecord> findByPrefix(String prefix) {
        return jdbc.sql(SELECT + " WHERE k.prefix = :prefix")
                .param("prefix", prefix)
                .query(ApiKeyRepository::map)
                .optional();
    }

    public List<ApiKeyRecord> findAll() {
        return jdbc.sql(SELECT + " ORDER BY k.id DESC")
                .query(ApiKeyRepository::map)
                .list();
    }

    public boolean revoke(long id) {
        return jdbc.sql("UPDATE public.api_keys SET revoked_at = COALESCE(revoked_at, now()) WHERE id = :id")
                        .param("id", id)
                        .update()
                > 0;
    }

    public void touch(long id) {
        jdbc.sql("UPDATE public.api_keys SET last_used_at = now()"
                        + " WHERE id = :id AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')")
                .param("id", id)
                .update();
    }

    private static ApiKeyRecord map(ResultSet rs, int row) throws SQLException {
        return new ApiKeyRecord(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("prefix"),
                rs.getString("secret_hash"),
                List.of((String[]) rs.getArray("scopes").getArray()),
                rs.getString("created_by"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("expires_at", OffsetDateTime.class),
                rs.getObject("last_used_at", OffsetDateTime.class),
                rs.getObject("revoked_at", OffsetDateTime.class));
    }
}
