package team.jawa.churn.auth;

public record AuthenticatedUser(long id, String role, String provider) {

    public boolean admin() {
        return "admin".equals(role);
    }
}
