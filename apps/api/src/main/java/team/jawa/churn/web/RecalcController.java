package team.jawa.churn.web;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.RecalcApi;
import team.jawa.churn.api.generated.model.RecalcAccepted;
import team.jawa.churn.api.generated.model.RecalcRun;
import team.jawa.churn.api.generated.model.RecalcStatus;
import team.jawa.churn.recalc.RecalcScheduler;
import team.jawa.churn.recalc.RecalcService;

@RestController
class RecalcController implements RecalcApi {

    private static final int RECENT_RUNS = 20;

    private final RecalcService service;
    private final RecalcScheduler scheduler;

    RecalcController(RecalcService service, RecalcScheduler scheduler) {
        this.service = service;
        this.scheduler = scheduler;
    }

    @Override
    public ResponseEntity<RecalcAccepted> requestRecalc(String scope) {
        if (!"pending".equals(scope) && !"all".equals(scope)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_filter", "scope must be pending or all");
        }
        if ("all".equals(scope)) {
            service.enqueueAll();
        }
        RecalcScheduler.State state = scheduler.requestNow("manual");
        RecalcAccepted.StateEnum value = state == RecalcScheduler.State.SCHEDULED
                ? RecalcAccepted.StateEnum.SCHEDULED
                : RecalcAccepted.StateEnum.COALESCED;
        return ResponseEntity.accepted().body(new RecalcAccepted(value));
    }

    @Override
    public ResponseEntity<RecalcStatus> getRecalcStatus() {
        List<RecalcRun> recent = service.recentRuns(RECENT_RUNS).stream()
                .map(RecalcController::toRun)
                .toList();
        RecalcStatus status = new RecalcStatus(
                scheduler.isRunning() || service.runningElsewhere(), (int) service.pendingAccounts(), recent);
        status.setLastRun(recent.isEmpty() ? null : recent.get(0));
        return ResponseEntity.ok(status);
    }

    static RecalcRun toRun(RecalcService.Run run) {
        return new RecalcRun(
                        run.id(),
                        RecalcRun.TriggerEnum.fromValue(run.trigger()),
                        run.startedAt(),
                        run.accountsProcessed(),
                        RecalcRun.StatusEnum.fromValue(run.status()))
                .finishedAt(run.finishedAt())
                .asOf(run.asOf())
                .modelVersion(run.modelVersion())
                .error(run.error());
    }
}
