package team.jawa.churn.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import team.jawa.churn.web.ApiException;

@Service
public class ApiKeyService {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyService.class);

    private static final String PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final String SECRET_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int PREFIX_LENGTH = 8;
    private static final int SECRET_LENGTH = 32;
    private static final Pattern KEY_FORMAT = Pattern.compile("^ck_([a-z0-9]{8})_([0-9A-Za-z]{32})$");

    private final ApiKeyRepository keys;
    private final SecureRandom random = new SecureRandom();

    ApiKeyService(ApiKeyRepository keys) {
        this.keys = keys;
    }

    public record Issued(ApiKeyRecord key, String secret) {}

    public Issued issue(String name, List<String> scopes, OffsetDateTime expiresAt, Long createdBy) {
        String trimmed = name.trim();
        if (trimmed.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", "name must not be blank");
        }
        if (expiresAt != null && !expiresAt.isAfter(OffsetDateTime.now())) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", "expiresAt must be in the future");
        }
        String prefix = randomString(PREFIX_ALPHABET, PREFIX_LENGTH);
        String secret = randomString(SECRET_ALPHABET, SECRET_LENGTH);
        ApiKeyRecord record = keys.insert(trimmed, prefix, hash(secret), scopes, createdBy, expiresAt);
        log.info("api key issued: prefix={} scopes={}", prefix, scopes);
        return new Issued(record, "ck_" + prefix + "_" + secret);
    }

    public List<ApiKeyRecord> list() {
        return keys.findAll();
    }

    public void revoke(long id) {
        ApiKeyRecord record = keys.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "api key not found"));
        keys.revoke(id);
        log.info("api key revoked: prefix={}", record.prefix());
    }

    public Optional<ApiKeyPrincipal> authenticate(String presented) {
        Matcher matcher = KEY_FORMAT.matcher(presented);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        Optional<ApiKeyRecord> found = keys.findByPrefix(matcher.group(1));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        ApiKeyRecord record = found.get();
        boolean matches = MessageDigest.isEqual(
                hash(matcher.group(2)).getBytes(StandardCharsets.US_ASCII),
                record.secretHash().getBytes(StandardCharsets.US_ASCII));
        boolean active = record.revokedAt() == null
                && (record.expiresAt() == null || record.expiresAt().isAfter(OffsetDateTime.now()));
        if (!matches || !active) {
            return Optional.empty();
        }
        keys.touch(record.id());
        return Optional.of(new ApiKeyPrincipal(record.id(), record.name(), record.scopes()));
    }

    private String randomString(String alphabet, int length) {
        StringBuilder value = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            value.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return value.toString();
    }

    private static String hash(String secret) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
