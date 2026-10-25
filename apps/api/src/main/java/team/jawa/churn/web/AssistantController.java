package team.jawa.churn.web;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import team.jawa.churn.api.generated.model.AssistantMessage;
import team.jawa.churn.api.generated.model.AssistantRequest;
import team.jawa.churn.assistant.AssistantProperties;
import team.jawa.churn.assistant.AssistantService;
import team.jawa.churn.auth.AuthenticatedUser;

@RestController
@RequestMapping("/api/v1/assistant/messages")
class AssistantController {

    private final AssistantProperties properties;
    private final AssistantService assistant;

    AssistantController(AssistantProperties properties, AssistantService assistant) {
        this.properties = properties;
        this.assistant = assistant;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    SseEmitter ask(@Valid @RequestBody AssistantRequest request) {
        List<AssistantMessage> messages = request.getMessages();
        if (messages.size() > properties.maxMessages()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", "too many messages");
        }
        if (messages.getLast().getRole() != AssistantMessage.RoleEnum.USER) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", "the last message must be from user");
        }
        if (!properties.enabled()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "assistant_disabled", "assistant is not available");
        }
        AuthenticatedUser user = user();
        if (!assistant.allow(user)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "too many assistant requests");
        }
        return assistant.start(user, messages, request.getPage(), request.getMcpKey());
    }

    private static AuthenticatedUser user() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return user;
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
    }
}
