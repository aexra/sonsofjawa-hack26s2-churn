package team.jawa.churn.auth;

import java.time.OffsetDateTime;
import java.util.List;

public record ApiKeyRecord(
        long id,
        String name,
        String prefix,
        String secretHash,
        List<String> scopes,
        String createdBy,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt,
        OffsetDateTime lastUsedAt,
        OffsetDateTime revokedAt) {}
