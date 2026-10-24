package team.jawa.churn.recalc;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class RecalcScheduler {

    public enum State {
        SCHEDULED,
        COALESCED
    }

    private static final Logger log = LoggerFactory.getLogger(RecalcScheduler.class);
    private static final Duration FIRST_TICK = Duration.ofSeconds(5);

    private final RecalcService service;
    private final RecalcProperties properties;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(runnable -> daemon(runnable, "recalc"));
    private final ScheduledExecutorService timer =
            Executors.newSingleThreadScheduledExecutor(runnable -> daemon(runnable, "recalc-timer"));

    private boolean running;
    private boolean rerunRequested;
    private String rerunTrigger;

    RecalcScheduler(RecalcService service, RecalcProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @PostConstruct
    void start() {
        if (!properties.enabled()) {
            log.info("recalculation timer is disabled");
            return;
        }
        Duration interval = properties.interval();
        Duration first = interval.compareTo(FIRST_TICK) < 0 ? interval : FIRST_TICK;
        timer.scheduleWithFixedDelay(
                () -> requestNow("timer"), first.toMillis(), interval.toMillis(), TimeUnit.MILLISECONDS);
        log.info("recalculation timer started: interval={}", interval);
    }

    @PreDestroy
    void stop() {
        timer.shutdownNow();
        worker.shutdownNow();
    }

    public synchronized State requestNow(String trigger) {
        if (running) {
            rerunRequested = true;
            rerunTrigger = trigger;
            return State.COALESCED;
        }
        running = true;
        worker.submit(() -> loop(trigger));
        return State.SCHEDULED;
    }

    public synchronized boolean isRunning() {
        return running;
    }

    private void loop(String firstTrigger) {
        String trigger = firstTrigger;
        while (true) {
            try {
                service.run(trigger);
            } catch (RuntimeException e) {
                log.error("recalculation loop failed: trigger={}", trigger, e);
            }
            synchronized (this) {
                if (!rerunRequested) {
                    running = false;
                    return;
                }
                rerunRequested = false;
                trigger = rerunTrigger;
            }
        }
    }

    private static Thread daemon(Runnable runnable, String name) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(true);
        return thread;
    }
}
