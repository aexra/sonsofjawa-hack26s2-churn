package team.jawa.churn.assistant;

import java.time.Duration;
import java.time.Instant;

final class AssistantRun {

    private final Instant deadline;
    private Thread worker;
    private Runnable abort;
    private Outcome stopped;
    private boolean finished;
    private int steps;

    AssistantRun(Duration timeout) {
        this.deadline = Instant.now().plus(timeout);
    }

    synchronized void attach(Thread thread) {
        this.worker = thread;
    }

    synchronized void onAbort(Runnable action) {
        this.abort = action;
    }

    void stop(Outcome reason) {
        Runnable action;
        Thread thread;
        synchronized (this) {
            if (finished || stopped != null) {
                return;
            }
            stopped = reason;
            action = abort;
            thread = worker;
        }
        if (action != null) {
            action.run();
        }
        if (thread != null) {
            thread.interrupt();
        }
    }

    synchronized Outcome finish(Outcome outcome) {
        finished = true;
        return stopped != null ? stopped : outcome;
    }

    synchronized Outcome stopped() {
        return stopped;
    }

    void check() {
        Outcome reason = stopped();
        if (reason != null) {
            throw new AssistantFailure(reason);
        }
    }

    Duration remaining() {
        return Duration.between(Instant.now(), deadline);
    }

    synchronized int steps() {
        return steps;
    }

    synchronized void step() {
        steps++;
    }
}
