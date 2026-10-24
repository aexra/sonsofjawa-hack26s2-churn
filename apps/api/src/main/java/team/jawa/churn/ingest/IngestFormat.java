package team.jawa.churn.ingest;

import java.util.Optional;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;

public enum IngestFormat {
    JSON("json"),
    CSV("csv");

    private static final MediaType TEXT_CSV = MediaType.parseMediaType("text/csv");

    private final String value;

    IngestFormat(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Optional<IngestFormat> fromContentType(String contentType) {
        if (contentType == null) {
            return Optional.empty();
        }
        try {
            MediaType type = MediaType.parseMediaType(contentType);
            if (MediaType.APPLICATION_JSON.equalsTypeAndSubtype(type)) {
                return Optional.of(JSON);
            }
            if (TEXT_CSV.equalsTypeAndSubtype(type)) {
                return Optional.of(CSV);
            }
            return Optional.empty();
        } catch (InvalidMediaTypeException e) {
            return Optional.empty();
        }
    }
}
