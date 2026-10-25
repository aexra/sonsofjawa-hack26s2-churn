package team.jawa.churn.web;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.ModelApi;
import team.jawa.churn.api.generated.model.ClockMode;
import team.jawa.churn.api.generated.model.ModelClock;
import team.jawa.churn.api.generated.model.ModelFeature;
import team.jawa.churn.api.generated.model.ModelRevision;
import team.jawa.churn.api.generated.model.ModelSetting;
import team.jawa.churn.api.generated.model.ModelSettings;
import team.jawa.churn.api.generated.model.ModelSettingsPatch;
import team.jawa.churn.api.generated.model.ModelSettingsUpdated;
import team.jawa.churn.api.generated.model.RecalcAccepted;
import team.jawa.churn.api.generated.model.SettingsGroup;
import team.jawa.churn.auth.AuthenticatedUser;
import team.jawa.churn.auth.UserRepository;
import team.jawa.churn.model.ModelSettingsService;
import team.jawa.churn.recalc.RecalcScheduler;

@RestController
class ModelController implements ModelApi {

    private final ModelSettingsService service;
    private final UserRepository users;

    ModelController(ModelSettingsService service, UserRepository users) {
        this.service = service;
        this.users = users;
    }

    @Override
    public ResponseEntity<ModelSettings> getModelSettings() {
        return ResponseEntity.ok(toDto(service.snapshot()));
    }

    @Override
    public ResponseEntity<ModelSettingsUpdated> updateModelSettings(ModelSettingsPatch patch) {
        Map<String, BigDecimal> values = patch.getValues();
        ModelSettingsService.ClockChange clock = patch.getClock() == null
                ? null
                : new ModelSettingsService.ClockChange(
                        patch.getClock().getMode().getValue(), patch.getClock().getAsOf());
        ModelSettingsService.Updated updated = service.update(values, clock, actor());
        ModelSettings settings = toDto(updated.snapshot());
        RecalcAccepted.StateEnum state = updated.recalc() == RecalcScheduler.State.SCHEDULED
                ? RecalcAccepted.StateEnum.SCHEDULED
                : RecalcAccepted.StateEnum.COALESCED;
        ModelSettingsUpdated body = new ModelSettingsUpdated(
                settings.getModelVersion(),
                settings.getClock(),
                settings.getGroups(),
                settings.getFeatures(),
                new RecalcAccepted(state));
        body.setUpdatedAt(settings.getUpdatedAt());
        body.setUpdatedBy(settings.getUpdatedBy());
        return ResponseEntity.ok(body);
    }

    @Override
    public ResponseEntity<List<ModelRevision>> listModelRevisions(Integer limit) {
        return ResponseEntity.ok(service.revisions(limit == null ? 50 : limit).stream()
                .map(revision -> new ModelRevision(
                        revision.version(),
                        revision.changedAt(),
                        revision.changedBy(),
                        ModelRevision.SourceEnum.fromValue(revision.source()),
                        revision.changes()))
                .toList());
    }

    private String actor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return users.findById(user.id()).map(account -> account.login()).orElse("unknown");
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
    }

    private static ModelSettings toDto(ModelSettingsService.Snapshot snapshot) {
        ModelSettingsService.Clock clock = snapshot.clock();
        ModelClock clockDto = new ModelClock(ClockMode.fromValue(clock.mode()), clock.asOf())
                .frozenAt(clock.frozenAt())
                .shiftSeconds(clock.shiftSeconds())
                .updatedAt(clock.updatedAt())
                .updatedBy(clock.updatedBy());
        List<SettingsGroup> groups = snapshot.groups().entrySet().stream()
                .map(entry -> new SettingsGroup(
                        SettingsGroup.KeyEnum.fromValue(entry.getKey()),
                        entry.getValue().stream().map(ModelController::toDto).toList()))
                .toList();
        List<ModelFeature> features = snapshot.features().stream()
                .map(feature -> new ModelFeature(
                        feature.key(),
                        feature.weightKey(),
                        feature.title(),
                        feature.description(),
                        feature.reasonTemplate()))
                .toList();
        ModelSettings dto = new ModelSettings(snapshot.modelVersion(), clockDto, groups, features);
        dto.setUpdatedAt(snapshot.updatedAt());
        dto.setUpdatedBy(snapshot.updatedBy());
        return dto;
    }

    private static ModelSetting toDto(ModelSettingsService.Setting setting) {
        return new ModelSetting(
                        setting.key(),
                        setting.value(),
                        setting.defaultValue(),
                        setting.min(),
                        setting.max(),
                        ModelSetting.UnitEnum.fromValue(setting.unit()),
                        setting.title(),
                        setting.description())
                .share(setting.share());
    }
}
