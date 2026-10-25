package team.jawa.churn.assistant;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

final class AssistantStream {

    private final SseEmitter emitter;
    private final AssistantRun run;

    AssistantStream(SseEmitter emitter, AssistantRun run) {
        this.emitter = emitter;
        this.run = run;
    }

    void step(String id, String tool, String status, String summary) {
        Map<String, Object> data = event("step");
        data.put("id", id);
        data.put("tool", tool);
        data.put("status", status);
        if (summary != null) {
            data.put("summary", summary);
        }
        send(data);
    }

    void text(String delta) {
        Map<String, Object> data = event("text");
        data.put("delta", delta);
        send(data);
    }

    void done(int steps) {
        Map<String, Object> data = event("done");
        data.put("steps", steps);
        sendQuietly(data);
    }

    void error(String code) {
        Map<String, Object> data = event("error");
        data.put("code", code);
        sendQuietly(data);
    }

    void complete() {
        try {
            emitter.complete();
        } catch (IllegalStateException e) {
            run.stop(Outcome.CANCELLED);
        }
    }

    private static Map<String, Object> event(String type) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", type);
        return data;
    }

    private void send(Map<String, Object> data) {
        if (!write(data)) {
            run.stop(Outcome.CANCELLED);
            throw new AssistantFailure(Outcome.CANCELLED);
        }
    }

    private void sendQuietly(Map<String, Object> data) {
        write(data);
    }

    private boolean write(Map<String, Object> data) {
        try {
            emitter.send(SseEmitter.event().name((String) data.get("type")).data(data, MediaType.APPLICATION_JSON));
            return true;
        } catch (IOException | IllegalStateException e) {
            return false;
        }
    }
}
