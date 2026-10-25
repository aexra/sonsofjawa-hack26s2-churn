package team.jawa.churn.analytics;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class MlClient {
    private final String url;
    private final JsonMapper json;
    private final HttpClient client =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

    public MlClient(@Value("${ML_URL:}") String url, JsonMapper json) {
        this.url = url;
        this.json = json;
    }

    public boolean enabled() {
        return !url.isBlank();
    }

    public JsonNode post(String path, Object body) {
        if (!enabled()) throw new IllegalStateException("ML is not configured");
        var request = HttpRequest.newBuilder(URI.create(url + path))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        try {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("ML response " + response.statusCode());
            }
            return json.readTree(response.body());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("ML request interrupted", error);
        } catch (java.io.IOException error) {
            throw new IllegalStateException("ML unavailable", error);
        }
    }
}
