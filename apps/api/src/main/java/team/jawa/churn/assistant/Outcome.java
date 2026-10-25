package team.jawa.churn.assistant;

import java.util.Locale;

enum Outcome {
    ANSWERED(null),
    CANCELLED(null),
    RATE_LIMITED(null),
    UNAVAILABLE("assistant_unavailable"),
    TIMEOUT("assistant_timeout"),
    KEY_INVALID("assistant_key_invalid"),
    KEY_FORBIDDEN("assistant_key_forbidden"),
    STEP_LIMIT("assistant_step_limit");

    private final String code;

    Outcome(String code) {
        this.code = code;
    }

    String code() {
        return code;
    }

    String tag() {
        return name().toLowerCase(Locale.ROOT);
    }
}
