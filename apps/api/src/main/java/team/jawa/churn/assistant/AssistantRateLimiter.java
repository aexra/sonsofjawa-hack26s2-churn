package team.jawa.churn.assistant;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;

@Component
class AssistantRateLimiter {

    static final int LIMIT = 10;
    static final Duration WINDOW = Duration.ofMinutes(1);

    private final Map<Long, Deque<Instant>> hits = new ConcurrentHashMap<>();

    boolean tryAcquire(long userId) {
        Instant now = Instant.now();
        Instant oldest = now.minus(WINDOW);
        AtomicBoolean allowed = new AtomicBoolean();
        hits.compute(userId, (id, times) -> {
            Deque<Instant> window = times == null ? new ArrayDeque<>() : times;
            while (!window.isEmpty() && !window.peekFirst().isAfter(oldest)) {
                window.pollFirst();
            }
            if (window.size() < LIMIT) {
                window.addLast(now);
                allowed.set(true);
            }
            return window;
        });
        return allowed.get();
    }

    void reset() {
        hits.clear();
    }
}
