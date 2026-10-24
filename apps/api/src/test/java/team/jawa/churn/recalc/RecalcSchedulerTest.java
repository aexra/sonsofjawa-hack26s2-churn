package team.jawa.churn.recalc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;

class RecalcSchedulerTest {

    private static RecalcProperties properties(boolean enabled, Duration interval) {
        return new RecalcProperties(enabled, interval, Duration.ofDays(90), Duration.ofDays(7), "0 30 3 * * *");
    }

    private static final RecalcService.Outcome DONE = new RecalcService.Outcome(RecalcService.Result.OK, 1);

    @Test
    void aRequestDuringARunIsCoalescedIntoOneMoreRun() throws Exception {
        RecalcService service = mock(RecalcService.class);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(service.run("manual")).thenAnswer(call -> {
            entered.countDown();
            release.await(10, TimeUnit.SECONDS);
            return DONE;
        });
        when(service.run("model")).thenReturn(DONE);
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(false, Duration.ofMinutes(1)));

        RecalcScheduler.State first = scheduler.requestNow("manual");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        RecalcScheduler.State second = scheduler.requestNow("ingest");
        RecalcScheduler.State third = scheduler.requestNow("model");
        release.countDown();

        assertThat(first).isEqualTo(RecalcScheduler.State.SCHEDULED);
        assertThat(second).isEqualTo(RecalcScheduler.State.COALESCED);
        assertThat(third).isEqualTo(RecalcScheduler.State.COALESCED);
        await().atMost(Duration.ofSeconds(5)).until(() -> !scheduler.isRunning());
        InOrder order = Mockito.inOrder(service);
        order.verify(service).run("manual");
        order.verify(service).run("model");
        verify(service, never()).run("ingest");
        verify(service, times(2)).run(anyString());
        scheduler.stop();
    }

    @Test
    void aNewRequestAfterTheRunIsScheduledAgain() {
        RecalcService service = mock(RecalcService.class);
        when(service.run(anyString())).thenReturn(DONE);
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(false, Duration.ofMinutes(1)));

        assertThat(scheduler.requestNow("manual")).isEqualTo(RecalcScheduler.State.SCHEDULED);
        await().atMost(Duration.ofSeconds(5)).until(() -> !scheduler.isRunning());

        assertThat(scheduler.requestNow("manual")).isEqualTo(RecalcScheduler.State.SCHEDULED);
        await().atMost(Duration.ofSeconds(5)).until(() -> !scheduler.isRunning());
        verify(service, times(2)).run("manual");
        scheduler.stop();
    }

    @Test
    void aFailingRunDoesNotStopTheLoop() {
        RecalcService service = mock(RecalcService.class);
        AtomicInteger calls = new AtomicInteger();
        when(service.run(anyString())).thenAnswer(call -> {
            if (calls.incrementAndGet() == 1) {
                throw new IllegalStateException("boom");
            }
            return DONE;
        });
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(false, Duration.ofMinutes(1)));

        scheduler.requestNow("manual");
        await().atMost(Duration.ofSeconds(5)).until(() -> !scheduler.isRunning());
        scheduler.requestNow("manual");
        await().atMost(Duration.ofSeconds(5)).until(() -> calls.get() == 2 && !scheduler.isRunning());

        assertThat(calls.get()).isEqualTo(2);
        scheduler.stop();
    }

    @Test
    void theTimerRequestsRunsWhileEnabled() {
        RecalcService service = mock(RecalcService.class);
        when(service.run("timer")).thenReturn(DONE);
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(true, Duration.ofMillis(50)));

        scheduler.start();

        await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> verify(service, atLeast(3)).run("timer"));
        scheduler.stop();
    }

    @Test
    void theTimerStaysOffWhenDisabled() throws Exception {
        RecalcService service = mock(RecalcService.class);
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(false, Duration.ofMillis(20)));

        scheduler.start();
        Thread.sleep(200);

        verify(service, never()).run(anyString());
        scheduler.stop();
    }

    @Test
    void anErrorInsideARunStillReleasesTheScheduler() {
        RecalcService service = mock(RecalcService.class);
        AtomicInteger calls = new AtomicInteger();
        when(service.run(anyString())).thenAnswer(call -> {
            if (calls.incrementAndGet() == 1) {
                throw new AssertionError("fatal");
            }
            return DONE;
        });
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(false, Duration.ofMinutes(1)));

        scheduler.requestNow("manual");
        await().atMost(Duration.ofSeconds(5)).until(() -> !scheduler.isRunning());

        assertThat(scheduler.requestNow("manual")).isEqualTo(RecalcScheduler.State.SCHEDULED);
        scheduler.stop();
    }

    @Test
    void aTimerTickDoesNotReplaceAMoreSpecificPendingTrigger() throws Exception {
        RecalcService service = mock(RecalcService.class);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(service.run(anyString())).thenReturn(DONE);
        when(service.run("ingest")).thenAnswer(call -> {
            entered.countDown();
            release.await(10, TimeUnit.SECONDS);
            return DONE;
        });
        RecalcScheduler scheduler = new RecalcScheduler(service, properties(false, Duration.ofMinutes(1)));

        scheduler.requestNow("ingest");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        scheduler.requestNow("manual");
        scheduler.requestNow("timer");
        release.countDown();

        await().atMost(Duration.ofSeconds(5)).until(() -> !scheduler.isRunning());
        verify(service).run("manual");
        verify(service, never()).run("timer");
        scheduler.stop();
    }
}
