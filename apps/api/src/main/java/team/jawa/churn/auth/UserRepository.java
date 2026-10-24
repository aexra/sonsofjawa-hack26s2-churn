package team.jawa.churn.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private static final String COLUMNS = "id, login, email, display_name, role, auth_provider, password_hash, enabled";

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

    public long insertLocal(String login, String displayName, String role, String passwordHash) {
        return jdbc.sql("INSERT INTO public.users (login, display_name, role, auth_provider, password_hash)"
                        + " VALUES (:login, :displayName, :role, 'local', :passwordHash) RETURNING id")
                .param("login", login)
                .param("displayName", displayName)
                .param("role", role)
                .param("passwordHash", passwordHash)
                .query(Long.class)
                .single();
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
                rs.getBoolean("enabled"));
    }
}
