package team.jawa.churn.events;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class EventSubscribers {

    static final Duration HEARTBEAT = Duration.ofSeconds(25);
    static final String PING = ": ping";

    private static final Logger log = LoggerFactory.getLogger(EventSubscribers.class);

    private final Set<SseEmitter> subscribers = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService heartbeats =
            Executors.newSingleThreadScheduledExecutor(runnable -> daemon(runnable, "event-heartbeat"));

    EventSubscribers() {
        heartbeats.scheduleAtFixedRate(
                this::heartbeat, HEARTBEAT.toMillis(), HEARTBEAT.toMillis(), TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void stop() {
        heartbeats.shutdownNow();
        for (SseEmitter emitter : List.copyOf(subscribers)) {
            drop(emitter);
        }
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        subscribers.add(emitter);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> subscribers.remove(emitter));
        emitter.onError(error -> subscribers.remove(emitter));
        write(emitter, SseEmitter.event().reconnectTime(3000));
        return emitter;
    }

    void broadcast(String type, String json) {
        if (type.indexOf('\n') >= 0 || type.indexOf('\r') >= 0 || json.indexOf('\n') >= 0 || json.indexOf('\r') >= 0) {
            return;
        }
        for (SseEmitter emitter : List.copyOf(subscribers)) {
            write(emitter, SseEmitter.event().name(type).data(json));
        }
    }

    private void heartbeat() {
        try {
            for (SseEmitter emitter : List.copyOf(subscribers)) {
                write(emitter, SseEmitter.event().comment(" ping"));
            }
        } catch (RuntimeException e) {
            log.warn("heartbeat failed: {}", e.getMessage());
        }
    }

    private void write(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | RuntimeException e) {
            drop(emitter);
        }
    }

    private void drop(SseEmitter emitter) {
        subscribers.remove(emitter);
        try {
            emitter.complete();
        } catch (RuntimeException e) {
            log.debug("subscriber already closed: {}", e.getMessage());
        }
    }

    private static Thread daemon(Runnable runnable, String name) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(true);
        return thread;
    }
}
