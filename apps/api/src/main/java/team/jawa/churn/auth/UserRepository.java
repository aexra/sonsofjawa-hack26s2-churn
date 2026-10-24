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
public class UserRepository {

    private static final String COLUMNS = "id, login, email, display_name, role, auth_provider, password_hash, enabled,"
            + " created_at, last_login_at";

    private final JdbcClient jdbc;

    UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserAccount> findByLogin(String login) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM public.users WHERE login = :login")
                .param("login", login)
                .query(UserRepository::map)
                .optional();
    }

    public Optional<UserAccount> findById(long id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM public.users WHERE id = :id")
                .param("id", id)
                .query(UserRepository::map)
                .optional();
    }

    public boolean existsAdmin() {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM public.users WHERE role = 'admin')")
                .query(Boolean.class)
                .single();
    }

    public long insertLocal(String login, String displayName, String email, String role, String passwordHash) {
        return jdbc.sql("INSERT INTO public.users (login, display_name, email, role, auth_provider, password_hash)"
                        + " VALUES (:login, :displayName, :email, :role, 'local', :passwordHash) RETURNING id")
                .param("login", login)
                .param("displayName", displayName, Types.VARCHAR)
                .param("email", email, Types.VARCHAR)
                .param("role", role)
                .param("passwordHash", passwordHash)
                .query(Long.class)
                .single();
    }

    public Optional<UserAccount> findByOidcSubject(String subject) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM public.users WHERE oidc_subject = :subject")
                .param("subject", subject)
                .query(UserRepository::map)
                .optional();
    }

    public long insertOidc(String login, String displayName, String email, String role, String subject) {
        return jdbc.sql("INSERT INTO public.users (login, display_name, email, role, auth_provider, oidc_subject)"
                        + " VALUES (:login, :displayName, :email, :role, 'oidc', :subject) RETURNING id")
                .param("login", login)
                .param("displayName", displayName, Types.VARCHAR)
                .param("email", email, Types.VARCHAR)
                .param("role", role)
                .param("subject", subject)
                .query(Long.class)
                .single();
    }

    public void updateOidc(long id, String role, String displayName, String email) {
        jdbc.sql("UPDATE public.users SET role = :role, display_name = :displayName, email = :email WHERE id = :id")
                .param("id", id)
                .param("role", role)
                .param("displayName", displayName, Types.VARCHAR)
                .param("email", email, Types.VARCHAR)
                .update();
    }

    public List<UserAccount> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM public.users ORDER BY id")
                .query(UserRepository::map)
                .list();
    }

    public void lockAdministration() {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtext('churn.users'))")
                .query()
                .singleRow();
    }

    public long countOtherActiveAdmins(long excludedId) {
        return jdbc.sql("SELECT count(*) FROM public.users WHERE role = 'admin' AND enabled AND id <> :id")
                .param("id", excludedId)
                .query(Long.class)
                .single();
    }

    public void update(long id, String role, boolean enabled, String displayName, String email, String passwordHash) {
        jdbc.sql("UPDATE public.users SET role = :role, enabled = :enabled, display_name = :displayName,"
                        + " email = :email, password_hash = :passwordHash WHERE id = :id")
                .param("id", id)
                .param("role", role)
                .param("enabled", enabled)
                .param("displayName", displayName, Types.VARCHAR)
                .param("email", email, Types.VARCHAR)
                .param("passwordHash", passwordHash, Types.VARCHAR)
                .update();
    }

    public void delete(long id) {
        jdbc.sql("DELETE FROM public.users WHERE id = :id").param("id", id).update();
    }

    public void touchLastLogin(long id) {
        jdbc.sql("UPDATE public.users SET last_login_at = now() WHERE id = :id")
                .param("id", id)
                .update();
    }

    private static UserAccount map(ResultSet rs, int row) throws SQLException {
        return new UserAccount(
                rs.getLong("id"),
                rs.getString("login"),
                rs.getString("email"),
                rs.getString("display_name"),
                rs.getString("role"),
                rs.getString("auth_provider"),
                rs.getString("password_hash"),
                rs.getBoolean("enabled"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("last_login_at", OffsetDateTime.class));
    }
}
