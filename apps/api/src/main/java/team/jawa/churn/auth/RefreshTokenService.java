package team.jawa.churn.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    public record Rotation(long userId, String token) {}

    private record Created(long id, String token) {}

    private record Stored(long id, long userId, UUID familyId, OffsetDateTime expiresAt, OffsetDateTime revokedAt) {}

    private final JdbcClient jdbc;
    private final AuthProperties properties;
    private final SecureRandom random = new SecureRandom();

    RefreshTokenService(JdbcClient jdbc, AuthProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    @Transactional
    public String issue(long userId) {
        return create(userId, UUID.randomUUID()).token();
    }

    @Transactional
    public Optional<Rotation> rotate(String token) {
        Optional<Stored> found = jdbc.sql("SELECT id, user_id, family_id, expires_at, revoked_at"
                        + " FROM public.refresh_tokens WHERE token_hash = :hash FOR UPDATE")
                .param("hash", hash(token))
                .query((rs, row) -> new Stored(
                        rs.getLong("id"),
                        rs.getLong("user_id"),
                        rs.getObject("family_id", UUID.class),
                        rs.getObject("expires_at", OffsetDateTime.class),
                        rs.getObject("revoked_at", OffsetDateTime.class)))
                .optional();
        if (found.isEmpty()) {
            return Optional.empty();
        }
        Stored stored = found.get();
        if (stored.revokedAt() != null) {
            revokeFamily(stored.familyId());
            log.warn("refresh token reuse detected, token family revoked");
            return Optional.empty();
        }
        if (!stored.expiresAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC))) {
            return Optional.empty();
        }
        Created created = create(stored.userId(), stored.familyId());
        jdbc.sql("UPDATE public.refresh_tokens SET revoked_at = now(), replaced_by = :replacedBy WHERE id = :id")
                .param("replacedBy", created.id())
                .param("id", stored.id())
                .update();
        return Optional.of(new Rotation(stored.userId(), created.token()));
    }

    @Transactional
    public void revokeFamilyOf(String token) {
        jdbc.sql("UPDATE public.refresh_tokens SET revoked_at = now()"
                        + " WHERE revoked_at IS NULL AND family_id ="
                        + " (SELECT family_id FROM public.refresh_tokens WHERE token_hash = :hash)")
                .param("hash", hash(token))
                .update();
    }

    private void revokeFamily(UUID familyId) {
        jdbc.sql("UPDATE public.refresh_tokens SET revoked_at = now()"
                        + " WHERE revoked_at IS NULL AND family_id = :familyId")
                .param("familyId", familyId)
                .update();
    }

    private Created create(long userId, UUID familyId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plus(properties.refreshTtl());
        long id = jdbc.sql("INSERT INTO public.refresh_tokens (user_id, family_id, token_hash, expires_at)"
                        + " VALUES (:userId, :familyId, :hash, :expiresAt) RETURNING id")
                .param("userId", userId)
                .param("familyId", familyId)
                .param("hash", hash(token))
                .param("expiresAt", expiresAt)
                .query(Long.class)
                .single();
        return new Created(id, token);
    }

    private static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
