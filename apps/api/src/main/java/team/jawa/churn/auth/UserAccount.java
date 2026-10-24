package team.jawa.churn.auth;

public record UserAccount(
        long id,
        String login,
        String email,
        String displayName,
        String role,
        String authProvider,
        String passwordHash,
        boolean enabled) {}
