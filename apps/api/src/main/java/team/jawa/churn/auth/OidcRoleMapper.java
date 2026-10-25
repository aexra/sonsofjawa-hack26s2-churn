package team.jawa.churn.auth;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class OidcRoleMapper {

    private OidcRoleMapper() {}

    public static Optional<String> resolve(
            Map<String, Object> claims, String rolesClaim, String adminRole, String userRole) {
        List<String> roles = roles(claims, rolesClaim);
        if (roles.contains(adminRole)) {
            return Optional.of("admin");
        }
        if (roles.contains(userRole)) {
            return Optional.of("user");
        }
        return Optional.empty();
    }

    private static List<String> roles(Map<String, Object> claims, String path) {
        Object value = claims.get(path);
        if (value == null && path.contains(".")) {
            value = walk(claims, path);
        }
        if (value instanceof Collection<?> collection) {
            return collection.stream().map(String::valueOf).toList();
        }
        if (value instanceof String text) {
            return List.of(text.trim().split("[\\s,]+"));
        }
        return List.of();
    }

    private static Object walk(Map<String, Object> claims, String path) {
        Object current = claims;
        for (String part : path.split("\\.")) {
            if (current instanceof Map<?, ?> map) {
                current = map.get(part);
            } else {
                return null;
            }
        }
        return current;
    }
}
