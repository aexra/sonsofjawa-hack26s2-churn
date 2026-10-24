package team.jawa.churn.web;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final List<Map<String, String>> errors;

    public ApiException(HttpStatus status, String code, String detail) {
        this(status, code, detail, List.of());
    }

    public ApiException(HttpStatus status, String code, String detail, List<Map<String, String>> errors) {
        super(detail);
        this.status = status;
        this.code = code;
        this.errors = errors;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public List<Map<String, String>> errors() {
        return errors;
    }
}
