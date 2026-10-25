package team.jawa.churn.web;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import team.jawa.churn.api.generated.model.AssistantMessage;
import team.jawa.churn.api.generated.model.AssistantRequest;
import team.jawa.churn.assistant.AssistantProperties;

@RestController
@RequestMapping("/api/v1/assistant/messages")
class AssistantController {

    private final AssistantProperties properties;

    AssistantController(AssistantProperties properties) {
        this.properties = properties;
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
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "assistant_disabled", "assistant is not available");
    }
}
