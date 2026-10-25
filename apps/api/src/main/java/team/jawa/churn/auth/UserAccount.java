package team.jawa.churn.auth;

import java.time.OffsetDateTime;

public record UserAccount(
        long id,
        String login,
        String email,
        String displayName,
        String role,
        String authProvider,
        String passwordHash,
        boolean enabled,
        OffsetDateTime createdAt,
        OffsetDateTime lastLoginAt) {}
