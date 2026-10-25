package team.jawa.churn.assistant;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
class AssistantExecutors {

    private final ExecutorService workers = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("assistant-", 0).factory());
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "assistant-timer");
        thread.setDaemon(true);
        return thread;
    });

    void submit(Runnable task) {
        workers.execute(task);
    }

    ScheduledFuture<?> after(Duration delay, Runnable task) {
        return timers.schedule(task, Math.max(delay.toMillis(), 0), TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void stop() {
        timers.shutdownNow();
        workers.shutdownNow();
    }
}
