package team.jawa.churn.ingest;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

@ConfigurationProperties("ingest")
public record IngestProperties(int maxRows, DataSize maxBytes) {}
