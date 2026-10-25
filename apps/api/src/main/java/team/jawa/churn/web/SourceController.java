package team.jawa.churn.web;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import team.jawa.churn.api.generated.model.IngestLogPage;
import team.jawa.churn.api.generated.model.IngestResult;
import team.jawa.churn.api.generated.model.IngestResultApplied;
import team.jawa.churn.api.generated.model.RecalcAccepted;
import team.jawa.churn.auth.ApiKeyPrincipal;
import team.jawa.churn.auth.AuthenticatedUser;
import team.jawa.churn.auth.UserAccount;
import team.jawa.churn.auth.UserRepository;
import team.jawa.churn.ingest.Actor;
import team.jawa.churn.ingest.IngestFormat;
import team.jawa.churn.ingest.IngestProperties;
import team.jawa.churn.ingest.IngestService;
import team.jawa.churn.ingest.SnapshotService;
import team.jawa.churn.ingest.SourceEntity;
import team.jawa.churn.ingest.SourceReader;
import team.jawa.churn.recalc.RecalcScheduler;

@RestController
@RequestMapping("/api/v1/source")
class SourceController {

    private static final int DEFAULT_SIZE = 25;
    private static final int MAX_SIZE = 500;
    private static final int MAX_IDS = 500;

    private final IngestService ingest;
    private final SnapshotService snapshots;
    private final SourceReader reader;
    private final IngestProperties properties;
    private final UserRepository users;

    SourceController(
            IngestService ingest,
            SnapshotService snapshots,
            SourceReader reader,
            IngestProperties properties,
            UserRepository users) {
        this.ingest = ingest;
        this.snapshots = snapshots;
        this.reader = reader;
        this.properties = properties;
        this.users = users;
    }

    @PostMapping("/{entity}")
    ResponseEntity<IngestResult> upsert(@PathVariable String entity, HttpServletRequest request) throws IOException {
        SourceEntity target = entity(entity);
        IngestFormat format = IngestFormat.fromContentType(request.getContentType())
                .orElseThrow(() -> new ApiException(
                        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                        "unsupported_media_type",
                        "content type must be application/json or text/csv"));
        IngestService.Outcome outcome = ingest.upsert(target, format, body(request), actor());
        return ResponseEntity.ok(result(outcome));
    }

    @PutMapping("/snapshot")
    ResponseEntity<IngestResult> snapshot(HttpServletRequest request) throws IOException {
        MediaType media = mediaType(request.getContentType());
        if (media != null && MediaType.APPLICATION_JSON.equalsTypeAndSubtype(media)) {
            return ResponseEntity.ok(snapshotResult(snapshots.replaceJson(body(request), actor())));
        }
        if (media != null && MediaType.MULTIPART_FORM_DATA.equalsTypeAndSubtype(media)) {
            if (!(request instanceof MultipartHttpServletRequest multipart)) {
                throw unsupportedSnapshot();
            }
            return ResponseEntity.ok(snapshotResult(snapshots.replaceCsv(
                    part(multipart, "accounts"),
                    part(multipart, "services"),
                    part(multipart, "transactions"),
                    actor())));
        }
        throw unsupportedSnapshot();
    }

    @GetMapping("/{entity}")
    ResponseEntity<Object> list(
            @PathVariable String entity,
            @RequestParam(required = false) List<Long> ids,
            @RequestParam(required = false) Long ownerId,
            @RequestParam(required = false) Long serviceId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size) {
        SourceEntity source = entity(entity);
        checkPaging(page, size);
        if (ids != null && ids.size() > MAX_IDS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_filter", "at most " + MAX_IDS + " ids");
        }
        if (ownerId != null && source != SourceEntity.SERVICES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_filter", "ownerId applies to services only");
        }
        if (serviceId != null && source != SourceEntity.TRANSACTIONS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_filter", "serviceId applies to transactions only");
        }
        Object body = switch (source) {
            case ACCOUNTS -> reader.accounts(ids, page, size);
            case SERVICES -> reader.services(ids, ownerId, page, size);
            case TRANSACTIONS -> reader.transactions(ids, serviceId, page, size);
        };
        return ResponseEntity.ok(body);
    }

    @GetMapping("/ingest-log")
    ResponseEntity<IngestLogPage> ingestLog(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size) {
        checkPaging(page, size);
        return ResponseEntity.ok(reader.log(page, size));
    }

    private static SourceEntity entity(String path) {
        return SourceEntity.byPath(path)
                .orElseThrow(
                        () -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "unknown source entity " + path));
    }

    private static void checkPaging(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_SIZE) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_filter", "page must be >= 0 and size within 1.." + MAX_SIZE);
        }
    }

    private byte[] body(HttpServletRequest request) throws IOException {
        long limit = properties.maxBytes().toBytes();
        if (request.getContentLengthLong() > limit) {
            throw tooLarge(limit);
        }
        byte[] body = request.getInputStream().readNBytes((int) Math.min(limit + 1, Integer.MAX_VALUE - 8));
        if (body.length > limit) {
            throw tooLarge(limit);
        }
        return body;
    }

    private static ApiException tooLarge(long limit) {
        return new ApiException(
                HttpStatus.CONTENT_TOO_LARGE, "payload_too_large", "request body is limited to " + limit + " bytes");
    }

    private static MediaType mediaType(String contentType) {
        if (contentType == null) {
            return null;
        }
        try {
            return MediaType.parseMediaType(contentType);
        } catch (InvalidMediaTypeException e) {
            return null;
        }
    }

    private static ApiException unsupportedSnapshot() {
        return new ApiException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "unsupported_media_type",
                "content type must be application/json or multipart/form-data");
    }

    private static byte[] part(MultipartHttpServletRequest request, String name) throws IOException {
        MultipartFile file = request.getFile(name);
        if (file != null) {
            return file.getBytes();
        }
        String text = request.getParameter(name);
        if (text != null) {
            return text.getBytes(StandardCharsets.UTF_8);
        }
        return null;
    }

    private Actor actor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication == null ? null : authentication.getPrincipal();
        if (principal instanceof ApiKeyPrincipal key) {
            return new Actor(key.name(), "api");
        }
        if (principal instanceof AuthenticatedUser user) {
            String login = users.findById(user.id()).map(UserAccount::login).orElse("user-" + user.id());
            return new Actor(login, "web");
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
    }

    private static IngestResult result(IngestService.Outcome outcome) {
        IngestResultApplied applied = new IngestResultApplied();
        switch (outcome.entity()) {
            case ACCOUNTS -> applied.accounts(outcome.rowsApplied());
            case SERVICES -> applied.services(outcome.rowsApplied());
            case TRANSACTIONS -> applied.transactions(outcome.rowsApplied());
        }
        RecalcAccepted.StateEnum state = outcome.recalc() == RecalcScheduler.State.SCHEDULED
                ? RecalcAccepted.StateEnum.SCHEDULED
                : RecalcAccepted.StateEnum.COALESCED;
        return new IngestResult(
                        IngestResult.ModeEnum.UPSERT,
                        IngestResult.EntityEnum.fromValue(outcome.entity().path()),
                        IngestResult.FormatEnum.fromValue(outcome.format().value()),
                        outcome.rowsReceived(),
                        outcome.rowsApplied(),
                        new RecalcAccepted(state))
                .logId(outcome.logId())
                .applied(applied);
    }

    private static IngestResult snapshotResult(SnapshotService.Outcome outcome) {
        IngestResultApplied applied = new IngestResultApplied();
        applied.accounts(outcome.accounts());
        applied.services(outcome.services());
        applied.transactions(outcome.transactions());
        RecalcAccepted.StateEnum state = outcome.recalc() == RecalcScheduler.State.SCHEDULED
                ? RecalcAccepted.StateEnum.SCHEDULED
                : RecalcAccepted.StateEnum.COALESCED;
        return new IngestResult(
                        IngestResult.ModeEnum.SNAPSHOT,
                        IngestResult.EntityEnum.SNAPSHOT,
                        IngestResult.FormatEnum.fromValue(outcome.format().value()),
                        outcome.rowsReceived(),
                        outcome.rowsApplied(),
                        new RecalcAccepted(state))
                .logId(outcome.logId())
                .applied(applied);
    }
}
