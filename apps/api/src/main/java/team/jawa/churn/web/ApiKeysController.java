package team.jawa.churn.web;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.ApiKeysApi;
import team.jawa.churn.api.generated.model.ApiKey;
import team.jawa.churn.api.generated.model.ApiKeyCreate;
import team.jawa.churn.api.generated.model.ApiKeyCreated;
import team.jawa.churn.api.generated.model.ApiKeyScope;
import team.jawa.churn.auth.ApiKeyRecord;
import team.jawa.churn.auth.ApiKeyService;
import team.jawa.churn.auth.AuthenticatedUser;

@RestController
class ApiKeysController implements ApiKeysApi {

    private final ApiKeyService keys;

    ApiKeysController(ApiKeyService keys) {
        this.keys = keys;
    }

    @Override
    public ResponseEntity<List<ApiKey>> listApiKeys() {
        return ResponseEntity.ok(
                keys.list().stream().map(ApiKeysController::toApiKey).toList());
    }

    @Override
    public ResponseEntity<ApiKeyCreated> createApiKey(ApiKeyCreate request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Long creator = authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user
                ? user.id()
                : null;
        ApiKeyService.Issued issued = keys.issue(
                request.getName(),
                request.getScopes().stream().map(ApiKeyScope::getValue).toList(),
                request.getExpiresAt(),
                creator);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ApiKeyCreated(toApiKey(issued.key()), issued.secret()));
    }

    @Override
    public ResponseEntity<Void> revokeApiKey(Long id) {
        keys.revoke(id);
        return ResponseEntity.noContent().build();
    }

    private static ApiKey toApiKey(ApiKeyRecord record) {
        return new ApiKey(
                        record.id(),
                        record.name(),
                        record.prefix(),
                        record.scopes().stream().map(ApiKeyScope::fromValue).toList(),
                        record.createdAt())
                .createdBy(record.createdBy())
                .expiresAt(record.expiresAt())
                .lastUsedAt(record.lastUsedAt())
                .revokedAt(record.revokedAt());
    }
}
