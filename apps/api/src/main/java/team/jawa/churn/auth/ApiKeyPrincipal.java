package team.jawa.churn.auth;

import java.util.List;

public record ApiKeyPrincipal(long id, String name, List<String> scopes) {}
