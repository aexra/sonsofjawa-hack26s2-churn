package team.jawa.churn.web;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Object> handleApi(ApiException ex, WebRequest request) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        ResponseEntity<Object> response = handleExceptionInternal(ex, body, new HttpHeaders(), ex.status(), request);
        body.setProperty("code", ex.code());
        if (!ex.errors().isEmpty()) {
            body.setProperty("errors", ex.errors());
        }
        return response;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException ex, WebRequest request) {
        List<Map<String, String>> errors = ex.getConstraintViolations().stream()
                .map(violation -> {
                    String field = fieldOf(violation.getPropertyPath().toString());
                    return Map.of(
                            "code", "invalid_value", "field", field, "message", String.valueOf(violation.getMessage()));
                })
                .toList();
        String code = errors.stream()
                .map(error -> parameterCode(error.get("field")))
                .filter(candidate -> !"validation_failed".equals(candidate))
                .findFirst()
                .orElse("validation_failed");
        return handleApi(new ApiException(HttpStatus.BAD_REQUEST, code, "invalid request parameters", errors), request);
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String parameter = ex instanceof MethodArgumentTypeMismatchException mismatch ? mismatch.getName() : "";
        return handleApi(
                new ApiException(
                        HttpStatus.BAD_REQUEST,
                        parameterCode(parameter),
                        "invalid value for parameter " + parameter,
                        List.of(Map.of("code", "invalid_value", "field", parameter, "message", "invalid value"))),
                request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> handleAccessDenied(AccessDeniedException ex, WebRequest request) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "access denied");
        return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.FORBIDDEN, request);
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Object> handleAuthentication(AuthenticationException ex, WebRequest request) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "authentication required");
        return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.UNAUTHORIZED, request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) {
        log.error("unhandled exception", ex);
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "internal error");
        return handleExceptionInternal(ex, body, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_CONTENT, "validation failed");
        body.setProperty(
                "errors",
                ex.getBindingResult().getFieldErrors().stream()
                        .map(error -> Map.of(
                                "code", String.valueOf(error.getCode()),
                                "field", error.getField(),
                                "message", String.valueOf(error.getDefaultMessage())))
                        .toList());
        return handleExceptionInternal(ex, body, headers, HttpStatus.UNPROCESSABLE_CONTENT, request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            problem.setProperty("code", codeOf(statusCode));
            problem.setProperty("requestId", MDC.get(RequestIdFilter.MDC_KEY));
        }
        return response;
    }

    private static String parameterCode(String parameter) {
        return switch (parameter) {
            case "sort" -> "invalid_sort";
            case "fields" -> "invalid_field";
            case "level", "status", "q", "minScore", "maxScore", "minLoss", "hasAnomalies" -> "invalid_filter";
            default -> "validation_failed";
        };
    }

    private static String fieldOf(String path) {
        String[] parts = path.split("\\.");
        String name = parts.length > 1 ? parts[1] : parts[0];
        int bracket = name.indexOf('[');
        return bracket < 0 ? name : name.substring(0, bracket);
    }

    private static String codeOf(HttpStatusCode status) {
        return switch (status.value()) {
            case 400, 422 -> "validation_failed";
            case 401 -> "unauthenticated";
            case 403 -> "forbidden";
            case 404 -> "not_found";
            case 409 -> "conflict";
            case 413 -> "payload_too_large";
            case 415 -> "unsupported_media_type";
            default -> "internal";
        };
    }
}
